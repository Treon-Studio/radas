import { useQueryClient } from '@tanstack/react-query';
import { clearPersistedCache, persistQueryClient } from '@/shared/utils/storage/query-persistence';

/**
 * Hook to manage query cache persistence manually
 */
export function useCacheManager() {
  const queryClient = useQueryClient();

  const forcePersist = () => {
    persistQueryClient(queryClient);
  };

  const clearCache = () => {
    queryClient.clear();
    clearPersistedCache();
  };

  const getCacheSize = (): number => {
    try {
      const stored = localStorage.getItem('radas-query-cache');
      return stored ? new Blob([stored]).size : 0;
    } catch {
      return 0;
    }
  };

  const getCacheInfo = () => {
    try {
      const stored = localStorage.getItem('radas-query-cache');
      if (!stored) return null;
      
      const cache = JSON.parse(stored);
      const keys = Object.keys(cache);
      
      return {
        totalQueries: keys.length,
        sizeInBytes: new Blob([stored]).size,
        oldestEntry: keys.reduce((oldest, key) => {
          const entry = cache[key];
          return !oldest || entry.timestamp < oldest ? entry.timestamp : oldest;
        }, null as number | null),
        newestEntry: keys.reduce((newest, key) => {
          const entry = cache[key];
          return !newest || entry.timestamp > newest ? entry.timestamp : newest;
        }, null as number | null),
      };
    } catch {
      return null;
    }
  };

  return {
    forcePersist,
    clearCache,
    getCacheSize,
    getCacheInfo,
  };
}