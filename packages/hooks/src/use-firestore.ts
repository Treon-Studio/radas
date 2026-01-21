import { useState, useEffect } from "react";
import {
  getDocument,
  getAllDocuments,
  queryDocuments,
  subscribeToDocument,
  subscribeToCollection,
  createDocument,
  setDocument,
  updateDocument,
  deleteDocument,
  type DocumentData,
} from "@radas/config/lib/firebase";

// Hook for fetching a single document
export const useFirestoreDoc = <T = DocumentData>(
  collectionName: string,
  docId: string,
  realtime = false
) => {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (realtime) {
      // Subscribe to real-time updates
      const unsubscribe = subscribeToDocument<T>(
        collectionName,
        docId,
        (docData, err) => {
          if (err) {
            setError(err);
            setData(null);
          } else {
            setData(docData);
            setError(null);
          }
          setLoading(false);
        }
      );

      return () => unsubscribe();
    }

    // Fetch document once
    const fetchDoc = async () => {
      setLoading(true);
      const result = await getDocument<T>(collectionName, docId);

      if (result.success) {
        setData(result.data);
        setError(null);
      } else {
        setError(result.error as Error);
        setData(null);
      }
      setLoading(false);
    };

    fetchDoc();
  }, [collectionName, docId, realtime]);

  return { data, loading, error };
};

// Hook for fetching a collection
interface QueryOptions {
  field?: string;
  operator?: any;
  value?: unknown;
  orderByField?: string;
  orderByDirection?: "asc" | "desc";
  limitCount?: number;
}

export const useFirestoreCollection = <T = DocumentData>(
  collectionName: string,
  options: QueryOptions = {},
  realtime = false
) => {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (realtime) {
      // Subscribe to real-time updates
      const unsubscribe = subscribeToCollection<T>(
        collectionName,
        (collectionData, err) => {
          if (err) {
            setError(err);
            setData([]);
          } else {
            setData(collectionData);
            setError(null);
          }
          setLoading(false);
        },
        options
      );

      return () => unsubscribe();
    }

    // Fetch collection once
    const fetchCollection = async () => {
      setLoading(true);
      const result = Object.keys(options).length > 0
        ? await queryDocuments<T>(collectionName, options)
        : await getAllDocuments<T>(collectionName);

      if (result.success) {
        setData(result.data);
        setError(null);
      } else {
        setError(result.error as Error);
        setData([]);
      }
      setLoading(false);
    };

    fetchCollection();
  }, [collectionName, JSON.stringify(options), realtime]);

  return { data, loading, error };
};

// Hook for CRUD operations
export const useFirestoreMutations = <T extends DocumentData>(
  collectionName: string
) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const create = async (data: T) => {
    setLoading(true);
    setError(null);
    const result = await createDocument(collectionName, data);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  };

  const set = async (docId: string, data: T, merge = true) => {
    setLoading(true);
    setError(null);
    const result = await setDocument(collectionName, docId, data, merge);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  };

  const update = async (docId: string, data: Partial<T>) => {
    setLoading(true);
    setError(null);
    const result = await updateDocument(collectionName, docId, data);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  };

  const remove = async (docId: string) => {
    setLoading(true);
    setError(null);
    const result = await deleteDocument(collectionName, docId);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  };

  return {
    create,
    set,
    update,
    remove,
    loading,
    error,
  };
};
