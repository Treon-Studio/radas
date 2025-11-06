import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  type Query,
  type DocumentData,
  type WhereFilterOp,
  type OrderByDirection,
  type Unsubscribe,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "./config";

// Helper function to remove undefined values from object
const removeUndefinedFields = <T extends DocumentData>(data: T): Partial<T> => {
  const cleaned: any = {};
  Object.keys(data).forEach((key) => {
    if (data[key] !== undefined) {
      cleaned[key] = data[key];
    }
  });
  return cleaned;
};

// Helper function to get a collection reference
export const getCollection = (collectionName: string) => {
  return collection(db, collectionName);
};

// Helper function to get a document reference
export const getDocRef = (collectionName: string, docId: string) => {
  return doc(db, collectionName, docId);
};

// Create a new document with auto-generated ID
export const createDocument = async <T extends DocumentData>(
  collectionName: string,
  data: T
) => {
  try {
    const colRef = getCollection(collectionName);
    const cleanedData = removeUndefinedFields({
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const docRef = await addDoc(colRef, cleanedData);
    return { success: true, id: docRef.id, error: null };
  } catch (error) {
    console.error("Error creating document:", error);
    return { success: false, id: null, error };
  }
};

// Create or update a document with a specific ID
export const setDocument = async <T extends DocumentData>(
  collectionName: string,
  docId: string,
  data: T,
  merge = true
) => {
  try {
    const docRef = getDocRef(collectionName, docId);
    const cleanedData = removeUndefinedFields({
      ...data,
      updatedAt: serverTimestamp(),
    });
    await setDoc(docRef, cleanedData, { merge });
    return { success: true, error: null };
  } catch (error) {
    console.error("Error setting document:", error);
    return { success: false, error };
  }
};

// Get a single document
export const getDocument = async <T = DocumentData>(
  collectionName: string,
  docId: string
) => {
  try {
    const docRef = getDocRef(collectionName, docId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return {
        success: true,
        data: { id: docSnap.id, ...docSnap.data() } as T,
        error: null,
      };
    }

    return {
      success: false,
      data: null,
      error: new Error("Document not found"),
    };
  } catch (error) {
    console.error("Error getting document:", error);
    return { success: false, data: null, error };
  }
};

// Update a document
export const updateDocument = async <T extends DocumentData>(
  collectionName: string,
  docId: string,
  data: Partial<T>
) => {
  try {
    const docRef = getDocRef(collectionName, docId);
    const cleanedData = removeUndefinedFields({
      ...data,
      updatedAt: serverTimestamp(),
    });
    await updateDoc(docRef, cleanedData);
    return { success: true, error: null };
  } catch (error) {
    console.error("Error updating document:", error);
    return { success: false, error };
  }
};

// Delete a document
export const deleteDocument = async (collectionName: string, docId: string) => {
  try {
    const docRef = getDocRef(collectionName, docId);
    await deleteDoc(docRef);
    return { success: true, error: null };
  } catch (error) {
    console.error("Error deleting document:", error);
    return { success: false, error };
  }
};

// Get all documents in a collection
export const getAllDocuments = async <T = DocumentData>(
  collectionName: string
) => {
  try {
    const colRef = getCollection(collectionName);
    const querySnapshot = await getDocs(colRef);

    const documents = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as T[];

    return { success: true, data: documents, error: null };
  } catch (error) {
    console.error("Error getting documents:", error);
    return { success: false, data: [], error };
  }
};

// Query documents with filters
interface QueryOptions {
  field?: string;
  operator?: WhereFilterOp;
  value?: unknown;
  orderByField?: string;
  orderByDirection?: OrderByDirection;
  limitCount?: number;
}

export const queryDocuments = async <T = DocumentData>(
  collectionName: string,
  options: QueryOptions = {}
) => {
  try {
    const colRef = getCollection(collectionName);
    const constraints = [];

    if (options.field && options.operator && options.value !== undefined) {
      constraints.push(where(options.field, options.operator, options.value));
    }

    if (options.orderByField) {
      constraints.push(
        orderBy(options.orderByField, options.orderByDirection || "asc")
      );
    }

    if (options.limitCount) {
      constraints.push(limit(options.limitCount));
    }

    const q = query(colRef, ...constraints);
    const querySnapshot = await getDocs(q);

    const documents = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as T[];

    return { success: true, data: documents, error: null };
  } catch (error) {
    console.error("Error querying documents:", error);
    return { success: false, data: [], error };
  }
};

// Real-time listener for a document
export const subscribeToDocument = <T = DocumentData>(
  collectionName: string,
  docId: string,
  callback: (data: T | null, error?: Error) => void
): Unsubscribe => {
  const docRef = getDocRef(collectionName, docId);

  return onSnapshot(
    docRef,
    (docSnap) => {
      if (docSnap.exists()) {
        callback({ id: docSnap.id, ...docSnap.data() } as T);
      } else {
        callback(null, new Error("Document not found"));
      }
    },
    (error) => {
      console.error("Error in document subscription:", error);
      callback(null, error as Error);
    }
  );
};

// Real-time listener for a collection
export const subscribeToCollection = <T = DocumentData>(
  collectionName: string,
  callback: (data: T[], error?: Error) => void,
  options: QueryOptions = {}
): Unsubscribe => {
  const colRef = getCollection(collectionName);
  const constraints = [];

  if (options.field && options.operator && options.value !== undefined) {
    constraints.push(where(options.field, options.operator, options.value));
  }

  if (options.orderByField) {
    constraints.push(
      orderBy(options.orderByField, options.orderByDirection || "asc")
    );
  }

  if (options.limitCount) {
    constraints.push(limit(options.limitCount));
  }

  const q = query(colRef, ...constraints);

  return onSnapshot(
    q,
    (querySnapshot) => {
      const documents = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as T[];
      callback(documents);
    },
    (error) => {
      console.error("Error in collection subscription:", error);
      callback([], error as Error);
    }
  );
};

// Export Firestore utilities
export { serverTimestamp, Timestamp };
export type { Unsubscribe, DocumentData };
