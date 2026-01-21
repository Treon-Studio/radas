import { QueryClient } from '@tanstack/react-query';

// Storage key for persisted query data
const QUERY_STORAGE_KEY = 'radas-query-cache';

// Maximum age for cached data (7 days in milliseconds)
const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000;

interface PersistedQueryData {
  timestamp: number;
  data: any;
}

interface PersistedCache {
  [key: string]: PersistedQueryData;
}

/**
 * Save React Query cache to localStorage
 */
export function persistQueryClient(queryClient: QueryClient): void {
  try {
    const cache = queryClient.getQueryCache();
    const persistedCache: PersistedCache = {};

    cache.getAll().forEach((query) => {
      const { queryKey, state } = query;
      
      // Only persist successful queries with data
      if (state.status === 'success' && state.data) {
        const key = JSON.stringify(queryKey);
        persistedCache[key] = {
          timestamp: Date.now(),
          data: state.data,
        };
      }
    });

    localStorage.setItem(QUERY_STORAGE_KEY, JSON.stringify(persistedCache));
  } catch (error) {
    console.warn('Failed to persist query cache:', error);
  }
}

/**
 * Restore React Query cache from localStorage
 */
export function restoreQueryClient(queryClient: QueryClient): void {
  try {
    const stored = localStorage.getItem(QUERY_STORAGE_KEY);
    if (!stored) return;

    const persistedCache: PersistedCache = JSON.parse(stored);
    const now = Date.now();

    Object.entries(persistedCache).forEach(([keyStr, cached]) => {
      // Skip expired data
      if (now - cached.timestamp > MAX_CACHE_AGE) {
        return;
      }

      try {
        const queryKey = JSON.parse(keyStr);
        
        // Set the cached data with a stale time to indicate it's from cache
        queryClient.setQueryData(queryKey, cached.data);
        
        // Mark as stale so it will refetch in background
        queryClient.invalidateQueries({ queryKey, refetchType: 'none' });
      } catch (error) {
        console.warn('Failed to restore query:', keyStr, error);
      }
    });
  } catch (error) {
    console.warn('Failed to restore query cache:', error);
  }
}

/**
 * Clear persisted query cache
 */
export function clearPersistedCache(): void {
  try {
    localStorage.removeItem(QUERY_STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to clear persisted cache:', error);
  }
}

/**
 * Setup automatic persistence - saves cache when queries succeed
 */
export function setupQueryPersistence(queryClient: QueryClient): void {
  const cache = queryClient.getQueryCache();
  
  // Listen for successful queries and persist the cache
  cache.subscribe((event) => {
    if (event?.type === 'updated' && event?.query?.state?.status === 'success') {
      // Debounce persistence to avoid excessive localStorage writes
      setTimeout(() => persistQueryClient(queryClient), 1000);
    }
  });
}