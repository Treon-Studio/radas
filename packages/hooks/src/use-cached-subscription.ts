import { useState, useEffect, useRef } from "react";
import { cacheService, type StoreName } from "@radas/api-client/services/indexed-db";

export interface UseCachedSubscriptionOptions<T> {
  /**
   * Cache store name
   */
  storeName: StoreName;

  /**
   * Cache key (e.g., userId, projectId)
   */
  cacheKey: string;

  /**
   * User ID for cache validation
   */
  userId: string;

  /**
   * Subscription function that returns unsubscribe function
   */
  subscribe: (callback: (data: T, error?: Error) => void) => () => void;

  /**
   * Enable realtime subscription
   */
  realtime?: boolean;

  /**
   * Enable caching
   */
  enableCache?: boolean;
}

export interface UseCachedSubscriptionReturn<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  fromCache: boolean;
}

/**
 * Hook that combines IndexedDB caching with Firestore subscriptions
 *
 * Flow:
 * 1. Load from cache immediately (fast initial render)
 * 2. Subscribe to Firestore for realtime updates
 * 3. Update cache when data changes
 *
 * @example
 * const { data, loading, fromCache } = useCachedSubscription({
 *   storeName: STORES.PROJECTS,
 *   cacheKey: userId,
 *   userId,
 *   subscribe: (callback) => subscribeToUserProjects(userId, callback),
 * });
 */
export function useCachedSubscription<T>({
  storeName,
  cacheKey,
  userId,
  subscribe,
  realtime = true,
  enableCache = true,
}: UseCachedSubscriptionOptions<T>): UseCachedSubscriptionReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [fromCache, setFromCache] = useState(false);

  const unsubscribeRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef(true);
  const hasLoadedFromCacheRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    hasLoadedFromCacheRef.current = false;

    // Load from cache first (if enabled)
    const loadFromCache = async () => {
      if (!enableCache || !cacheKey || !userId) {
        return;
      }

      try {
        const cachedData = await cacheService.get<T>(storeName, cacheKey, userId);

        if (cachedData && isMountedRef.current) {
          console.log(`[Cache] Loaded ${storeName}:${cacheKey} from cache`);
          setData(cachedData);
          setFromCache(true);
          setLoading(false);
          hasLoadedFromCacheRef.current = true;
        }
      } catch (err) {
        console.error(`[Cache] Error loading from cache:`, err);
        // Continue with subscription even if cache fails
      }
    };

    // Subscribe to Firestore
    const subscribeToData = () => {
      if (!cacheKey || !userId) {
        setData(null);
        setLoading(false);
        return;
      }

      if (!realtime && hasLoadedFromCacheRef.current) {
        // If realtime is disabled and we have cache, don't subscribe
        return;
      }

      const unsubscribe = subscribe((newData, err) => {
        if (!isMountedRef.current) return;

        if (err) {
          console.error(`[Subscription] Error:`, err);
          setError(err);
          setLoading(false);
          return;
        }

        setData(newData);
        setError(null);
        setLoading(false);
        setFromCache(false);

        // Update cache in background (if enabled)
        if (enableCache) {
          cacheService.set(storeName, cacheKey, newData, userId).catch((cacheErr) => {
            console.error(`[Cache] Error updating cache:`, cacheErr);
          });
        }
      });

      unsubscribeRef.current = unsubscribe;
    };

    // Execute loading sequence
    (async () => {
      await loadFromCache();
      subscribeToData();
    })();

    // Cleanup
    return () => {
      isMountedRef.current = false;
      if (unsubscribeRef.current) {
        try {
          unsubscribeRef.current();
        } catch (e) {
          console.error("[Subscription] Error unsubscribing:", e);
        }
        unsubscribeRef.current = null;
      }
    };
  }, [storeName, cacheKey, userId, realtime, enableCache]);

  return { data, loading, error, fromCache };
}
