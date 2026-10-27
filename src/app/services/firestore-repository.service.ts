import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  getDocs,
  doc,
  getDoc,
  query,
  documentId,
  limit as queryLimit,
  orderBy,
  startAfter,
  QueryConstraint
} from '@angular/fire/firestore';

export const MAX_FIRESTORE_PAGE_SIZE = 100;

export interface FirestorePageRequest {
  limit: number;
  afterId?: string;
}

export interface FirestorePage<T = any> {
  items: T[];
  nextCursor: string | null;
}

export interface IFirestoreRepository {
  readAll(collectionName: string): Promise<any[]>;
  readPage(
    collectionName: string,
    request: FirestorePageRequest
  ): Promise<FirestorePage>;
  readAllFromSubcollection(
    parentCollection: string,
    parentId: string,
    subcollection: string
  ): Promise<any[]>;
  read(collectionName: string, id: string): Promise<any | null>;
}

@Injectable({ providedIn: 'root' })
export class FirestoreRepository implements IFirestoreRepository {
  constructor(private firestore: Firestore) {}

  async readAll(collectionName: string): Promise<any[]> {
    const snap = await getDocs(collection(this.firestore, collectionName));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  }

  async readPage(
    collectionName: string,
    request: FirestorePageRequest
  ): Promise<FirestorePage> {
    if (
      !Number.isInteger(request.limit) ||
      request.limit < 1 ||
      request.limit > MAX_FIRESTORE_PAGE_SIZE
    ) {
      throw new RangeError(
        `limit must be an integer between 1 and ${MAX_FIRESTORE_PAGE_SIZE}`
      );
    }
    if (request.afterId !== undefined && request.afterId.trim().length === 0) {
      throw new TypeError('afterId must be a non-empty document ID');
    }

    const constraints: QueryConstraint[] = [orderBy(documentId())];
    if (request.afterId !== undefined) {
      constraints.push(startAfter(request.afterId));
    }
    constraints.push(queryLimit(request.limit + 1));

    const pageQuery = query(
      collection(this.firestore, collectionName),
      ...constraints
    );
    const snap = await getDocs(pageQuery);
    const hasNextPage = snap.docs.length > request.limit;
    const pageDocs = snap.docs.slice(0, request.limit);

    return {
      items: pageDocs.map((d) => ({ id: d.id, ...(d.data() as any) })),
      nextCursor: hasNextPage ? pageDocs.at(-1)?.id ?? null : null
    };
  }

  async readAllFromSubcollection(
    parentCollection: string,
    parentId: string,
    subcollection: string
  ): Promise<any[]> {
    const parentRef = doc(this.firestore, parentCollection, parentId);
    const q = query(collection(parentRef, subcollection));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  }

  async read(collectionName: string, id: string): Promise<any | null> {
    const docRef = doc(this.firestore, collectionName, id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as any) };
  }
}
