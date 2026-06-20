/**
 * VSPRO Offline Store — IndexedDB wrapper for local data caching.
 * Provides a simple key-value store with TTL for offline resilience.
 */

const DB_NAME = 'vspro-offline';
const DB_VERSION = 1;
const STORE_NAME = 'cache';
const SYNC_STORE = 'sync-queue';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(SYNC_STORE)) {
        const store = db.createObjectStore(SYNC_STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('status', 'status', { unique: false });
      }
    };
  });
}

/** Store a value with optional TTL (in seconds) */
export async function setCache(key: string, data: any, ttlSeconds = 3600): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).put({
    key,
    data,
    expiresAt: Date.now() + ttlSeconds * 1000,
    cachedAt: Date.now(),
  });
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Get cached value (returns null if expired or missing) */
export async function getCache<T = any>(key: string): Promise<T | null> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const request = tx.objectStore(STORE_NAME).get(key);
  return new Promise((resolve) => {
    request.onsuccess = () => {
      const result = request.result;
      if (!result) return resolve(null);
      if (result.expiresAt < Date.now()) return resolve(null); // expired
      resolve(result.data as T);
    };
    request.onerror = () => resolve(null);
  });
}

/** Clear all cached data */
export async function clearCache(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).clear();
}

export { openDB, SYNC_STORE };
