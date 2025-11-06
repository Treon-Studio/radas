/**
 * IndexedDB Service for caching Firestore data
 * Provides offline-first capabilities and faster load times
 */

const DB_NAME = "radas_cache";
const DB_VERSION = 1;

// Store names
const STORES = {
  PROJECTS: "projects",
  TASKS: "tasks",
  STATUSES: "statuses",
  PRIORITIES: "priorities",
  LABELS: "labels",
  EPICS: "epics",
  PAGES: "pages",
  TEST_CASES: "test_cases",
  LINKS: "links",
  METADATA: "metadata",
} as const;

type StoreName = (typeof STORES)[keyof typeof STORES];

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  userId: string;
}

interface CacheMetadata {
  lastSync: number;
  version: number;
}

class IndexedDBService {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  private isAvailable = typeof window !== 'undefined' && 'indexedDB' in window && window.indexedDB != null;

  /**
   * Initialize IndexedDB
   */
  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    // Check if IndexedDB is available
    if (!this.isAvailable) {
      console.warn('[IndexedDB] Not available in this context');
      return Promise.resolve();
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error("[IndexedDB] Error opening database:", request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log("[IndexedDB] Database opened successfully");
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object stores
        Object.values(STORES).forEach((storeName) => {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName);
          }
        });

        console.log("[IndexedDB] Database upgraded to version", DB_VERSION);
      };
    });

    return this.initPromise;
  }

  /**
   * Get data from cache
   */
  async get<T>(storeName: StoreName, key: string, userId: string): Promise<T | null> {
    if (!this.isAvailable) return null;
    await this.init();
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction(storeName, "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        request.onsuccess = () => {
          const entry = request.result as CacheEntry<T> | undefined;

          // Validate cache entry
          if (!entry) {
            resolve(null);
            return;
          }

          // Check if cache belongs to current user
          if (entry.userId !== userId) {
            resolve(null);
            return;
          }

          // Check if cache is still valid (24 hours)
          const maxAge = 24 * 60 * 60 * 1000; // 24 hours
          const age = Date.now() - entry.timestamp;

          if (age > maxAge) {
            console.log(`[IndexedDB] Cache expired for ${storeName}:${key}`);
            resolve(null);
            return;
          }

          console.log(`[IndexedDB] Cache hit for ${storeName}:${key}`);
          resolve(entry.data);
        };

        request.onerror = () => {
          console.error(`[IndexedDB] Error getting ${storeName}:${key}`, request.error);
          reject(request.error);
        };
      } catch (error) {
        console.error(`[IndexedDB] Exception getting ${storeName}:${key}`, error);
        reject(error);
      }
    });
  }

  /**
   * Set data in cache
   */
  async set<T>(storeName: StoreName, key: string, data: T, userId: string): Promise<void> {
    if (!this.isAvailable) return;
    await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);

        const entry: CacheEntry<T> = {
          data,
          timestamp: Date.now(),
          userId,
        };

        const request = store.put(entry, key);

        request.onsuccess = () => {
          console.log(`[IndexedDB] Cache set for ${storeName}:${key}`);
          resolve();
        };

        request.onerror = () => {
          console.error(`[IndexedDB] Error setting ${storeName}:${key}`, request.error);
          reject(request.error);
        };
      } catch (error) {
        console.error(`[IndexedDB] Exception setting ${storeName}:${key}`, error);
        reject(error);
      }
    });
  }

  /**
   * Delete specific cache entry
   */
  async delete(storeName: StoreName, key: string): Promise<void> {
    if (!this.isAvailable) return;
    await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        const request = store.delete(key);

        request.onsuccess = () => {
          console.log(`[IndexedDB] Cache deleted for ${storeName}:${key}`);
          resolve();
        };

        request.onerror = () => {
          console.error(`[IndexedDB] Error deleting ${storeName}:${key}`, request.error);
          reject(request.error);
        };
      } catch (error) {
        console.error(`[IndexedDB] Exception deleting ${storeName}:${key}`, error);
        reject(error);
      }
    });
  }

  /**
   * Clear all cache for a specific store
   */
  async clear(storeName: StoreName): Promise<void> {
    if (!this.isAvailable) return;
    await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        const request = store.clear();

        request.onsuccess = () => {
          console.log(`[IndexedDB] Store cleared: ${storeName}`);
          resolve();
        };

        request.onerror = () => {
          console.error(`[IndexedDB] Error clearing ${storeName}`, request.error);
          reject(request.error);
        };
      } catch (error) {
        console.error(`[IndexedDB] Exception clearing ${storeName}`, error);
        reject(error);
      }
    });
  }

  /**
   * Clear all caches
   */
  async clearAll(): Promise<void> {
    if (!this.isAvailable) return;
    await this.init();
    if (!this.db) return;

    const promises = Object.values(STORES).map((storeName) => this.clear(storeName));
    await Promise.all(promises);
    console.log("[IndexedDB] All caches cleared");
  }

  /**
   * Get cache metadata
   */
  async getMetadata(key: string): Promise<CacheMetadata | null> {
    return this.get<CacheMetadata>(STORES.METADATA, key, "system");
  }

  /**
   * Set cache metadata
   */
  async setMetadata(key: string, metadata: CacheMetadata): Promise<void> {
    return this.set<CacheMetadata>(STORES.METADATA, key, metadata, "system");
  }
}

// Export singleton instance
export const cacheService = new IndexedDBService();

// Export store names for type safety
export { STORES };
export type { StoreName };

// Deprecated: Use cacheService instead
// @deprecated
export const indexedDB = cacheService;
