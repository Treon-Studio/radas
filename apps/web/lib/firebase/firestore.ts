import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  type DocumentData,
  type QueryConstraint,
  type CollectionReference,
  type DocumentReference,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './config';

/**
 * Get a document by ID
 */
export async function getDocument<T = DocumentData>(
  collectionName: string,
  documentId: string
): Promise<T | null> {
  const docRef = doc(db, collectionName, documentId);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() } as T;
  }

  return null;
}

/**
 * Get all documents from a collection
 */
export async function getDocuments<T = DocumentData>(
  collectionName: string,
  constraints: QueryConstraint[] = []
): Promise<T[]> {
  const collectionRef = collection(db, collectionName);
  const q = constraints.length > 0 ? query(collectionRef, ...constraints) : collectionRef;

  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as T));
}

/**
 * Add a new document
 */
export async function addDocument<T = DocumentData>(
  collectionName: string,
  data: T
): Promise<DocumentReference> {
  const collectionRef = collection(db, collectionName);
  return await addDoc(collectionRef, {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Set a document (create or overwrite)
 */
export async function setDocument<T = DocumentData>(
  collectionName: string,
  documentId: string,
  data: T,
  merge = false
): Promise<void> {
  const docRef = doc(db, collectionName, documentId);
  return await setDoc(
    docRef,
    {
      ...data,
      updatedAt: serverTimestamp(),
    },
    { merge }
  );
}

/**
 * Update a document
 */
export async function updateDocument<T = Partial<DocumentData>>(
  collectionName: string,
  documentId: string,
  data: T
): Promise<void> {
  const docRef = doc(db, collectionName, documentId);
  return await updateDoc(docRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Delete a document
 */
export async function deleteDocument(collectionName: string, documentId: string): Promise<void> {
  const docRef = doc(db, collectionName, documentId);
  return await deleteDoc(docRef);
}

/**
 * Query builder helpers
 */
export const queryHelpers = {
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
};

/**
 * Get collection reference
 */
export function getCollection(collectionName: string): CollectionReference {
  return collection(db, collectionName);
}

/**
 * Get document reference
 */
export function getDocRef(collectionName: string, documentId: string): DocumentReference {
  return doc(db, collectionName, documentId);
}
