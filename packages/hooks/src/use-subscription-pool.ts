import { useEffect, useRef, useState } from "react";

/**
 * Global subscription pool to prevent duplicate Firestore listeners
 *
 * This ensures that multiple components subscribing to the same data
 * only create ONE Firestore listener, reducing listener count dramatically.
 */

interface SubscriptionEntry<T> {
  unsubscribe: () => void;
  callbacks: Set<(data: T, error?: Error) => void>;
  data: T | null;
  error: Error | null;
}

class SubscriptionPool {
  private subscriptions = new Map<string, SubscriptionEntry<any>>();
  private listenerCount = 0;

  /**
   * Subscribe to a data source with automatic deduplication
   * Multiple calls with the same key will share one underlying subscription
   */
  subscribe<T>(
    key: string,
    subscribeFn: (callback: (data: T, error?: Error) => void) => () => void,
    callback: (data: T, error?: Error) => void
  ): () => void {
    let entry = this.subscriptions.get(key) as SubscriptionEntry<T> | undefined;

    if (!entry) {
      // Create new subscription
      console.log(`[SubscriptionPool] Creating new listener for: ${key}`);

      const callbacks = new Set<(data: T, error?: Error) => void>();

      const unsubscribe = subscribeFn((data, error) => {
        // Update entry data
        if (entry) {
          entry.data = data;
          entry.error = error || null;
        }

        // Notify all callbacks
        callbacks.forEach((cb) => {
          try {
            cb(data, error);
          } catch (err) {
            console.error('[SubscriptionPool] Error in callback:', err);
          }
        });
      });

      entry = {
        unsubscribe,
        callbacks,
        data: null,
        error: null,
      };

      this.subscriptions.set(key, entry);
      this.listenerCount++;

      if (process.env.NODE_ENV === 'development') {
        console.log(`[SubscriptionPool] Total active listeners: ${this.listenerCount}`);
        if (this.listenerCount > 50) {
          console.warn(`[SubscriptionPool] ⚠️ High listener count detected: ${this.listenerCount}. This may indicate a memory leak.`);
        }
      }
    }

    // Add callback to existing subscription
    entry.callbacks.add(callback);

    // Immediately call with cached data if available
    if (entry.data !== null) {
      try {
        callback(entry.data, entry.error || undefined);
      } catch (err) {
        console.error('[SubscriptionPool] Error in initial callback:', err);
      }
    }

    // Return unsubscribe function
    return () => {
      if (!entry) return;

      entry.callbacks.delete(callback);

      // If no more callbacks, clean up the subscription
      if (entry.callbacks.size === 0) {
        console.log(`[SubscriptionPool] Removing listener for: ${key}`);
        try {
          entry.unsubscribe();
        } catch (err) {
          console.error('[SubscriptionPool] Error unsubscribing:', err);
        }
        this.subscriptions.delete(key);
        this.listenerCount--;

        if (process.env.NODE_ENV === 'development') {
          console.log(`[SubscriptionPool] Total active listeners: ${this.listenerCount}`);
        }
      }
    };
  }

  /**
   * Get current active listener count (for monitoring)
   */
  getListenerCount(): number {
    return this.listenerCount;
  }

  /**
   * Get subscription details (for debugging)
   */
  getSubscriptionDetails(): Array<{ key: string; callbackCount: number }> {
    return Array.from(this.subscriptions.entries()).map(([key, entry]) => ({
      key,
      callbackCount: entry.callbacks.size,
    }));
  }

  /**
   * Force clear all subscriptions (use with caution, mainly for cleanup)
   */
  clearAll(): void {
    console.warn('[SubscriptionPool] Clearing all subscriptions');
    this.subscriptions.forEach((entry, key) => {
      try {
        entry.unsubscribe();
      } catch (err) {
        console.error(`[SubscriptionPool] Error unsubscribing ${key}:`, err);
      }
    });
    this.subscriptions.clear();
    this.listenerCount = 0;
  }
}

// Global singleton instance
export const subscriptionPool = new SubscriptionPool();

// Expose to window for debugging in development
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  (window as any).__subscriptionPool = subscriptionPool;
  console.log('[SubscriptionPool] Debugging available via window.__subscriptionPool');
}

/**
 * Hook to use pooled subscriptions
 *
 * @example
 * const { data, loading, error } = usePooledSubscription(
 *   `project-statuses-${projectId}`,
 *   (callback) => subscribeToProjectStatuses(projectId, callback)
 * );
 */
export function usePooledSubscription<T>(
  key: string | null | undefined,
  subscribeFn: (callback: (data: T, error?: Error) => void) => () => void,
  options?: {
    enabled?: boolean;
  }
) {
  const { enabled = true } = options || {};
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    if (!enabled || !key) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);

    // Subscribe via pool
    const unsubscribe = subscriptionPool.subscribe(
      key,
      subscribeFn,
      (newData, err) => {
        if (!isMountedRef.current) return;

        if (err) {
          setError(err);
          setData(null);
        } else {
          setData(newData);
          setError(null);
        }
        setLoading(false);
      }
    );

    unsubscribeRef.current = unsubscribe;

    return () => {
      isMountedRef.current = false;
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [key, enabled]);

  return { data, loading, error };
}
