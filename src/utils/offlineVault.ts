import type { ResolutionOption, SubtitleTrack } from '../types/media.ts';

export interface PermanentFileRecord {
  id: string;
  title: string;
  filename: string;
  resolution: ResolutionOption;
  formatLabel: string;
  sizeBytes: number;
  createdAt: number;
  storageMode: 'vault' | 'device-log';
  mimeType: string;
  sourceKind: string;
  subtitles?: SubtitleTrack[];
  hasBlob: boolean;
}

const DB_NAME = 'kinostream_offline_vault';
const DB_VERSION = 1;
const META_STORE = 'file_records';
const BLOB_STORE = 'file_blobs';

function openVaultDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listPermanentFiles(): Promise<PermanentFileRecord[]> {
  try {
    const db = await openVaultDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(META_STORE, 'readonly');
      const req = tx.objectStore(META_STORE).getAll();
      req.onsuccess = () => {
        const list = (req.result as PermanentFileRecord[]) || [];
        resolve(list.sort((a, b) => b.createdAt - a.createdAt));
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function savePermanentFileRecord(
  record: PermanentFileRecord,
  blob?: Blob,
): Promise<void> {
  const db = await openVaultDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([META_STORE, BLOB_STORE], 'readwrite');
    tx.objectStore(META_STORE).put(record);
    if (blob) {
      tx.objectStore(BLOB_STORE).put(blob, record.id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPermanentFileBlob(id: string): Promise<Blob | null> {
  const db = await openVaultDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BLOB_STORE, 'readonly');
    const req = tx.objectStore(BLOB_STORE).get(id);
    req.onsuccess = () => resolve((req.result as Blob) || null);
    req.onerror = () => reject(req.error);
  });
}

export async function deletePermanentFile(id: string): Promise<void> {
  const db = await openVaultDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([META_STORE, BLOB_STORE], 'readwrite');
    tx.objectStore(META_STORE).delete(id);
    tx.objectStore(BLOB_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearAllPermanentFiles(): Promise<void> {
  const db = await openVaultDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([META_STORE, BLOB_STORE], 'readwrite');
    tx.objectStore(META_STORE).clear();
    tx.objectStore(BLOB_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getBrowserStorageQuota(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  try {
    const est = await navigator.storage.estimate();
    return {
      usage: est.usage || 0,
      quota: est.quota || 0,
    };
  } catch {
    return null;
  }
}

export function triggerBlobDownload(blobOrUrl: Blob | string, filename: string): void {
  const anchor = document.createElement('a');
  let revokeAfter = false;
  if (typeof blobOrUrl === 'string') {
    anchor.href = blobOrUrl;
  } else {
    anchor.href = URL.createObjectURL(blobOrUrl);
    revokeAfter = true;
  }
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  if (revokeAfter) {
    setTimeout(() => URL.revokeObjectURL(anchor.href), 5000);
  }
}
