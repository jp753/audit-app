// All data lives on the phone in IndexedDB. Nothing is sent anywhere.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Audit, Brand, Library, PhotoRecord } from '../types';
import { DEFAULT_BRAND } from '../types';

interface AuditDB extends DBSchema {
  kv: { key: string; value: unknown };
  audits: { key: string; value: Audit; indexes: { status: string } };
  photos: { key: string; value: PhotoRecord; indexes: { auditId: string } };
}

const DB_NAME = 'training-audit';
let dbPromise: Promise<IDBPDatabase<AuditDB>> | null = null;

export function db(): Promise<IDBPDatabase<AuditDB>> {
  if (!dbPromise) {
    dbPromise = openDB<AuditDB>(DB_NAME, 1, {
      upgrade(d) {
        d.createObjectStore('kv');
        const a = d.createObjectStore('audits', { keyPath: 'id' });
        a.createIndex('status', 'status');
        const p = d.createObjectStore('photos', { keyPath: 'id' });
        p.createIndex('auditId', 'auditId');
      },
    });
  }
  return dbPromise;
}

/** For tests: forget the open connection. */
export function resetDbConnection() {
  dbPromise = null;
}

// ---------- key/value settings ----------
export const KV = {
  library: 'library', // the working library (may be edited)
  importedLibrary: 'importedLibrary', // last imported file, for "reset"
  brand: 'brand',
  lastBackup: 'lastBackup',
} as const;

export async function getKV<T>(key: string): Promise<T | undefined> {
  return (await db()).get('kv', key) as Promise<T | undefined>;
}
export async function setKV(key: string, value: unknown) {
  await (await db()).put('kv', value, key);
}

export const getLibrary = () => getKV<Library>(KV.library);
export async function getBrand(): Promise<Brand> {
  return { ...DEFAULT_BRAND, ...((await getKV<Brand>(KV.brand)) ?? {}) };
}

/** Import replaces both the working library and the "reset" copy. */
export async function importLibrary(lib: Library) {
  const d = await db();
  const tx = d.transaction('kv', 'readwrite');
  await tx.store.put(structuredClone(lib), KV.library);
  await tx.store.put(structuredClone(lib), KV.importedLibrary);
  await tx.done;
}

// ---------- audits ----------
export async function getAudit(id: string) {
  return (await db()).get('audits', id);
}
export async function allAudits(): Promise<Audit[]> {
  return (await db()).getAll('audits');
}
export async function saveAudit(audit: Audit) {
  const existing = await getAudit(audit.id);
  // A finished audit is locked: never overwrite it.
  if (existing?.status === 'finished') throw new Error('This audit is finished and locked.');
  audit.updatedAt = new Date().toISOString();
  await (await db()).put('audits', structuredClone(audit));
}
/** Used only by the "Finish" step, which is the one allowed write that locks it. */
export async function finishAudit(audit: Audit) {
  const existing = await getAudit(audit.id);
  if (existing?.status === 'finished') throw new Error('This audit is already finished.');
  const now = new Date().toISOString();
  const locked: Audit = { ...structuredClone(audit), status: 'finished', finishedAt: now, updatedAt: now };
  await (await db()).put('audits', locked);
  return locked;
}
export async function deleteAudit(id: string) {
  const d = await db();
  const tx = d.transaction(['audits', 'photos'], 'readwrite');
  await tx.objectStore('audits').delete(id);
  const photoKeys = await tx.objectStore('photos').index('auditId').getAllKeys(id);
  for (const k of photoKeys) await tx.objectStore('photos').delete(k);
  await tx.done;
}

// ---------- photos ----------
export async function savePhoto(p: PhotoRecord) {
  await (await db()).put('photos', p);
}
export async function getPhoto(id: string) {
  return (await db()).get('photos', id);
}
export async function deletePhoto(id: string) {
  await (await db()).delete('photos', id);
}
export async function photosForAudit(auditId: string) {
  return (await db()).getAllFromIndex('photos', 'auditId', auditId);
}

/** Ask Android not to clear our storage. Returns true if granted. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* not supported */
  }
  return false;
}

export function newId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
