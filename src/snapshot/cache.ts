import type { Snapshot } from './types';

const DATABASE = 'actual-dashboard-cache';
const STORE = 'snapshots';
const KEY = 'latest';

let database: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (database) return database;
  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('IndexedDB is unavailable.'));
      return;
    }
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open the dashboard cache.'));
  });
  database = pending.catch((error: unknown) => {
    database = null;
    throw error;
  });
  return database;
}

export async function loadCachedSnapshot(): Promise<Snapshot | null> {
  try {
    const db = await openDatabase();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve((request.result as Snapshot | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error('Could not read the dashboard cache.'));
    });
  } catch {
    return null;
  }
}

export async function saveCachedSnapshot(snapshot: Snapshot): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).put(snapshot, KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save the dashboard cache.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Saving the dashboard cache was interrupted.'));
  });
}
