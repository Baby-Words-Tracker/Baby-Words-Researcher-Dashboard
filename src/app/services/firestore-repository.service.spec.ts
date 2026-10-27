import { vi } from 'vitest';
import {
  collection,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  Firestore
} from '@angular/fire/firestore';
import { FirestoreRepository } from './firestore-repository.service';

vi.mock('@angular/fire/firestore', () => ({
  collection: vi.fn(() => 'collection-ref'),
  doc: vi.fn(),
  documentId: vi.fn(() => 'document-id-field'),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn((value: number) => ({ type: 'limit', value })),
  orderBy: vi.fn((field: unknown) => ({ type: 'orderBy', field })),
  query: vi.fn((...parts: unknown[]) => ({ type: 'query', parts })),
  startAfter: vi.fn((value: string) => ({ type: 'startAfter', value }))
}));

const mockedGetDocs = vi.mocked(getDocs);

function snapshot(ids: string[], data: Record<string, unknown>[] = []) {
  return {
    docs: ids.map((id, index) => ({
      id,
      data: () => data[index] ?? { value: id }
    }))
  };
}

describe('FirestoreRepository.readPage', () => {
  let repository: FirestoreRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new FirestoreRepository({} as Firestore);
  });

  it('returns a bounded first page ordered by document ID', async () => {
    mockedGetDocs.mockResolvedValue(
      snapshot(['child-a', 'child-b', 'child-c']) as never
    );

    const page = await repository.readPage('Child', { limit: 2 });

    expect(page).toEqual({
      items: [
        { id: 'child-a', value: 'child-a' },
        { id: 'child-b', value: 'child-b' }
      ],
      nextCursor: 'child-b'
    });
    expect(collection).toHaveBeenCalledWith(expect.anything(), 'Child');
    expect(documentId).toHaveBeenCalledOnce();
    expect(orderBy).toHaveBeenCalledWith('document-id-field');
    expect(limit).toHaveBeenCalledWith(3);
    expect(startAfter).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledOnce();
  });

  it('starts a subsequent page after the supplied document ID', async () => {
    mockedGetDocs.mockResolvedValue(snapshot(['child-c']) as never);

    const page = await repository.readPage('Child', {
      limit: 2,
      afterId: 'child-b'
    });

    expect(startAfter).toHaveBeenCalledWith('child-b');
    expect(page).toEqual({
      items: [{ id: 'child-c', value: 'child-c' }],
      nextCursor: null
    });
  });

  it('returns a null cursor for a terminal page', async () => {
    mockedGetDocs.mockResolvedValue(snapshot(['child-a', 'child-b']) as never);

    const page = await repository.readPage('Child', { limit: 3 });

    expect(page.nextCursor).toBeNull();
    expect(page.items).toHaveLength(2);
  });

  it.each([0, -1, 101, 1.5, Number.NaN])(
    'rejects invalid page limit %s before querying Firestore',
    async (invalidLimit) => {
      await expect(
        repository.readPage('Child', { limit: invalidLimit })
      ).rejects.toThrow('limit must be an integer between 1 and 100');
      expect(mockedGetDocs).not.toHaveBeenCalled();
    }
  );

  it('rejects an empty cursor before querying Firestore', async () => {
    await expect(
      repository.readPage('Child', { limit: 25, afterId: ' ' })
    ).rejects.toThrow('afterId must be a non-empty document ID');
    expect(mockedGetDocs).not.toHaveBeenCalled();
  });
});
