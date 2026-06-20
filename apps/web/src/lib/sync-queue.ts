/**
 * VSPRO Sync Queue — Queues mutations (POST/PATCH/DELETE) when offline
 * and processes them when connectivity returns.
 */

import { openDB, SYNC_STORE } from './offline-store';

export interface QueuedOperation {
  id?: number;
  method: string;
  url: string;
  body?: any;
  headers?: Record<string, string>;
  status: 'pending' | 'processing' | 'done' | 'failed';
  createdAt: number;
  error?: string;
}

/** Add an operation to the sync queue */
export async function enqueueOperation(op: Omit<QueuedOperation, 'id' | 'status' | 'createdAt'>): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(SYNC_STORE, 'readwrite');
  tx.objectStore(SYNC_STORE).add({
    ...op,
    status: 'pending',
    createdAt: Date.now(),
  });
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Get all pending operations */
export async function getPendingOperations(): Promise<QueuedOperation[]> {
  const db = await openDB();
  const tx = db.transaction(SYNC_STORE, 'readonly');
  const index = tx.objectStore(SYNC_STORE).index('status');
  const request = index.getAll('pending');
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result ?? []);
    request.onerror = () => resolve([]);
  });
}

/** Process all pending operations (call when back online) */
export async function processSyncQueue(): Promise<{ processed: number; failed: number }> {
  const pending = await getPendingOperations();
  let processed = 0;
  let failed = 0;

  for (const op of pending) {
    try {
      const response = await fetch(op.url, {
        method: op.method,
        headers: {
          'Content-Type': 'application/json',
          ...op.headers,
        },
        body: op.body ? JSON.stringify(op.body) : undefined,
      });

      if (response.ok) {
        await updateOperationStatus(op.id!, 'done');
        processed++;
      } else {
        await updateOperationStatus(op.id!, 'failed', `HTTP ${response.status}`);
        failed++;
      }
    } catch (err: any) {
      await updateOperationStatus(op.id!, 'failed', err.message);
      failed++;
    }
  }

  // Clean up completed operations
  await clearCompleted();

  return { processed, failed };
}

/** Get count of pending operations */
export async function getPendingCount(): Promise<number> {
  const pending = await getPendingOperations();
  return pending.length;
}

async function updateOperationStatus(id: number, status: string, error?: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(SYNC_STORE, 'readwrite');
  const store = tx.objectStore(SYNC_STORE);
  const request = store.get(id);
  request.onsuccess = () => {
    const op = request.result;
    if (op) {
      op.status = status;
      if (error) op.error = error;
      store.put(op);
    }
  };
}

async function clearCompleted(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(SYNC_STORE, 'readwrite');
  const store = tx.objectStore(SYNC_STORE);
  const index = store.index('status');
  const request = index.openCursor('done');
  request.onsuccess = () => {
    const cursor = request.result;
    if (cursor) {
      cursor.delete();
      cursor.continue();
    }
  };
}
