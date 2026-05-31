import type { PendingMediaRecord } from "./types";

const DB_NAME = "homestud-os-media";
const STORE_NAME = "pendingMedia";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "captureId" });
        store.createIndex("userId", "userId", { unique: false });
        store.createIndex("offlineClientId", "offlineClientId", { unique: true });
      }
    };
  });
}

export async function savePendingMedia(record: PendingMediaRecord): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE_NAME).put(record);
  });
  db.close();
}

export async function getPendingMedia(captureId: string): Promise<PendingMediaRecord | undefined> {
  const db = await openDb();
  const record = await new Promise<PendingMediaRecord | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    tx.onerror = () => reject(tx.error);
    const request = tx.objectStore(STORE_NAME).get(captureId);
    request.onsuccess = () => resolve(request.result as PendingMediaRecord | undefined);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return record;
}

export async function listPendingMedia(userId: string): Promise<PendingMediaRecord[]> {
  const db = await openDb();
  const records = await new Promise<PendingMediaRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    tx.onerror = () => reject(tx.error);
    const index = tx.objectStore(STORE_NAME).index("userId");
    const request = index.getAll(userId);
    request.onsuccess = () => resolve(request.result as PendingMediaRecord[]);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return records;
}

export async function deletePendingMedia(captureId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE_NAME).delete(captureId);
  });
  db.close();
}

export async function countPendingMedia(userId: string): Promise<number> {
  const items = await listPendingMedia(userId);
  return items.length;
}
