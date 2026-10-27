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
});
