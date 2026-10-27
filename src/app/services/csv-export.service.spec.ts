import { vi } from 'vitest';
import { Child } from '../models/child.model';
import { UserProfile } from '../models/user-profile.model';
import { Word } from '../models/word.model';
import { WordTracker } from '../models/word-tracker.model';
import { CsvExportService } from './csv-export.service';
import {
  FirestoreRepository,
  IFirestoreRepository
} from './firestore-repository.service';

function createService(repository: IFirestoreRepository): CsvExportService {
  return new CsvExportService(repository as FirestoreRepository);
}

function readBlobAsText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result)));
    reader.addEventListener('error', () => reject(reader.error));
    reader.readAsText(blob);
  });
}

describe('CsvExportService', () => {
  const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:test-download');
  let clickedAnchor: HTMLAnchorElement | null;

  beforeEach(() => {
    vi.clearAllMocks();
    clickedAnchor = null;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      clickedAnchor = this;
    });
  });

  it('exports the existing child word CSV schema and values', async () => {
    const repository: IFirestoreRepository = {
      readPage: vi.fn(),
      readAll: vi.fn(async (collectionName: string) => {
        if (collectionName === Child.collectionName) {
          return [
            {
              id: 'child-42',
              wordCount: 7,
              language: [{ name: 'English' }, { name: 'French' }],
              birthday: '2022-03-04T00:00:00.000Z',
              parentIDs: ['parent-1', 'parent-2']
            }
          ];
        }
        if (collectionName === UserProfile.collectionName) return [];
        return [];
      }),
      readAllFromSubcollection: vi.fn(
        async (parentCollection: string, parentId: string, subcollection: string) => {
          expect(parentCollection).toBe(Child.collectionName);
          expect(parentId).toBe('child-42');
          expect(subcollection).toBe(WordTracker.collectionName);
          return [
            {
              id: 'word-hello',
              firstUtterance: '2024-05-06T07:08:09.000Z',
              language: { name: 'English' },
              note: 'Greeting',
              videoId: 'video-1',
              phraseId: 'phrase-1',
              phraseText: 'hello there'
            }
          ];
        }
      ),
      read: vi.fn(async (collectionName: string, id: string) => {
        expect(collectionName).toBe(Word.collectionName);
        expect(id).toBe('word-hello');
        return {
          id: 'word-hello',
          languageDetails: {
            English: {
              lemma: 'hello',
              primaryPartOfSpeech: 'interjection',
              allPOS: ['interjection', 'noun'],
              primaryCategory: 'social',
              allCategories: ['social', 'greeting']
            }
          }
        };
      })
    };

    const result = await createService(repository).exportAllWordsToCSV();

    expect(result).toBe(true);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickedAnchor?.getAttribute('download')).toBe('full_word_list.csv');

    const downloadedBlob = createObjectURL.mock.calls[0][0] as Blob;
    expect(await readBlobAsText(downloadedBlob)).toBe(
      [
        '"Child_ID","Word","First_Utterance_DateTime","Word_Language","Lemma","Primary_Part_Of_Speech","All_Parts_Of_Speech","Primary_Category","All_Categories","Notes","Video_ID","Phrase_ID","Phrase_Text","Child_Total_Word_Count","Child_Languages","Child_Birthday","Parent_IDs","Utterance_Language"',
        '"child-42","word-hello","2024-05-06T07:08:09.000Z","English","hello","interjection","interjection;noun","social","social;greeting","Greeting","video-1","phrase-1","hello there","7","English;French","2022-03-04T00:00:00.000Z","parent-1;parent-2","English"'
      ].join('\r\n')
    );
  });

  it('does not download a CSV when a child has no word data', async () => {
    const repository: IFirestoreRepository = {
      readPage: vi.fn(),
      readAll: vi.fn(async (collectionName: string) =>
        collectionName === Child.collectionName
          ? [{ id: 'child-without-words' }]
          : []
      ),
      readAllFromSubcollection: vi.fn().mockResolvedValue([]),
      read: vi.fn().mockResolvedValue(null)
    };

    const result = await createService(repository).exportAllWordsToCSV();

    expect(result).toBe(false);
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('creates a batch CSV for a single child', async () => {
    const repository: IFirestoreRepository = {
      readAll: vi.fn(),
      readPage: vi.fn().mockResolvedValue({
        items: [
          {
            id: 'child-a',
            wordCount: 1,
            language: [{ name: 'English' }],
            birthday: '2022-01-02T00:00:00.000Z',
            parentIDs: ['parent-a']
          }
        ],
        nextCursor: null
      }),
      readAllFromSubcollection: vi.fn().mockResolvedValue([
        {
          id: 'word-a',
          firstUtterance: '2024-01-02T03:04:05.000Z',
          language: { name: 'English' },
          note: 'first word'
        }
      ]),
      read: vi.fn().mockResolvedValue({
        id: 'word-a',
        languageDetails: {
          English: {
            lemma: 'word a',
            primaryPartOfSpeech: 'noun',
            allPOS: ['noun'],
            primaryCategory: 'objects',
            allCategories: ['objects']
          }
        }
      })
    };

    const result = await createService(repository).exportChildWordsBatchToCSV({
      limit: 25
    });

    expect(result).toEqual({
      selectedChildren: 1,
      exportedRows: 1,
      downloaded: true,
      nextCursor: null
    });
    expect(repository.readPage).toHaveBeenCalledWith(Child.collectionName, {
      limit: 25,
      afterId: undefined
    });
    expect(clickedAnchor?.getAttribute('download')).toBe(
      'child_words_first_limit-25.csv'
    );

    const downloadedBlob = createObjectURL.mock.calls[0][0] as Blob;
    expect(await readBlobAsText(downloadedBlob)).toBe(
      [
        '"Child_ID","Word","First_Utterance_DateTime","Word_Language","Lemma","Primary_Part_Of_Speech","All_Parts_Of_Speech","Primary_Category","All_Categories","Notes","Video_ID","Phrase_ID","Phrase_Text","Child_Total_Word_Count","Child_Languages","Child_Birthday","Parent_IDs","Utterance_Language"',
        '"child-a","word-a","2024-01-02T03:04:05.000Z","English","word a","noun","noun","objects","objects","first word","","","","1","English","2022-01-02T00:00:00.000Z","parent-a","English"'
      ].join('\r\n')
    );
  });

  it('creates one batch CSV containing rows for multiple children', async () => {
    const children = [
      {
        id: 'child-a',
        wordCount: 1,
        language: [{ name: 'English' }],
        birthday: '2022-01-01T00:00:00.000Z',
        parentIDs: ['parent-a']
      },
      {
        id: 'child-b',
        wordCount: 1,
        language: [{ name: 'French' }],
        birthday: '2022-02-02T00:00:00.000Z',
        parentIDs: ['parent-b']
      }
    ];
    const repository: IFirestoreRepository = {
      readAll: vi.fn(),
      readPage: vi.fn().mockResolvedValue({
        items: children,
        nextCursor: 'child-b'
      }),
      readAllFromSubcollection: vi.fn(
        async (_collection: string, childId: string) => [
          {
            id: `word-${childId}`,
            firstUtterance:
              childId === 'child-a'
                ? '2024-03-01T00:00:00.000Z'
                : '2024-03-02T00:00:00.000Z',
            language: { name: childId === 'child-a' ? 'English' : 'French' }
          }
        ]
      ),
      read: vi.fn(async (_collection: string, wordId: string) => {
        const language = wordId.includes('child-a') ? 'English' : 'French';
        return {
          id: wordId,
          languageDetails: {
            [language]: { lemma: `${language.toLowerCase()} lemma` }
          }
        };
      })
    };

    const result = await createService(repository).exportChildWordsBatchToCSV({
      limit: 2,
      afterId: 'previous-child'
    });

    expect(result).toEqual({
      selectedChildren: 2,
      exportedRows: 2,
      downloaded: true,
      nextCursor: 'child-b'
    });
    const downloadedBlob = createObjectURL.mock.calls[0][0] as Blob;
    const csv = await readBlobAsText(downloadedBlob);
    expect(csv.split('\r\n')).toEqual([
      '"Child_ID","Word","First_Utterance_DateTime","Word_Language","Lemma","Primary_Part_Of_Speech","All_Parts_Of_Speech","Primary_Category","All_Categories","Notes","Video_ID","Phrase_ID","Phrase_Text","Child_Total_Word_Count","Child_Languages","Child_Birthday","Parent_IDs","Utterance_Language"',
      '"child-a","word-child-a","2024-03-01T00:00:00.000Z","English","english lemma","","","","","","","","","1","English","2022-01-01T00:00:00.000Z","parent-a","English"',
      '"child-b","word-child-b","2024-03-02T00:00:00.000Z","French","french lemma","","","","","","","","","1","French","2022-02-02T00:00:00.000Z","parent-b","French"'
    ]);
  });

  it('rejects batch data that cannot conform to the CSV format', async () => {
    const repository: IFirestoreRepository = {
      readAll: vi.fn(),
      readPage: vi.fn().mockResolvedValue({
        items: [{ id: 'child-invalid', birthday: 'not-a-date' }],
        nextCursor: null
      }),
      readAllFromSubcollection: vi.fn(),
      read: vi.fn()
    };

    await expect(
      createService(repository).exportChildWordsBatchToCSV({ limit: 25 })
    ).rejects.toThrow(
      'Child child-invalid has invalid birthday data for CSV export'
    );
    expect(repository.readAllFromSubcollection).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
