// React Query Client Configuration
import { QueryClient } from '@tanstack/react-query';
import { setupQueryPersistence, restoreQueryClient } from '@/shared/utils/storage/query-persistence';

// Create a QueryClient for React Query
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Don't retry on 4xx errors (client errors)
        if (error && typeof error === 'object' && 'response' in error) {
          const status = (error as any).response?.status;
          if (status >= 400 && status < 500) {
            return false;
          }
        }
        return failureCount < 3;
      },
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 24 * 60 * 60 * 1000, // Keep in memory for 24 hours
    },
    mutations: {
      retry: false,
    },
  },
});

// Setup automatic persistence
setupQueryPersistence(queryClient);

// Restore cache from localStorage on initialization
restoreQueryClient(queryClient);
