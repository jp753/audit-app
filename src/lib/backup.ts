// One-file backup of everything: audits, records, photos, brand and library.
import type { Audit, PhotoRecord } from '../types';
import { db, KV, setKV } from './db';
import { base64ToBlob, blobToBase64 } from './bytes';

export const BACKUP_APP = 'training-system-audit';
export const BACKUP_FORMAT = 1;

interface BackupPhoto extends Omit<PhotoRecord, 'blob'> {
  type: string;
  data: string; // base64
}

export interface BackupFile {
  app: typeof BACKUP_APP;
  format: number;
  appVersion: string;
  exportedAt: string;
  kv: Record<string, unknown>;
  audits: Audit[];
  photos: BackupPhoto[];
}

/** Settings that go into the backup. "lastBackup" is set from the file's date on restore. */
const KV_KEYS = [KV.library, KV.importedLibrary, KV.brand];

export async function createBackup(appVersion: string, now = new Date()): Promise<BackupFile> {
  const d = await db();
  const kv: Record<string, unknown> = {};
  for (const k of KV_KEYS) {
    const v = await d.get('kv', k);
    if (v !== undefined) kv[k] = v;
  }
  const audits = await d.getAll('audits');
  const photos: BackupPhoto[] = [];
  for (const p of await d.getAll('photos')) {
    const { blob, ...meta } = p;
    photos.push({ ...meta, type: blob.type || 'image/jpeg', data: await blobToBase64(blob) });
  }
  return { app: BACKUP_APP, format: BACKUP_FORMAT, appVersion, exportedAt: now.toISOString(), kv, audits, photos };
}

/** Backup as a file, without recording it as done (used before sharing). */
export async function buildBackupFile(appVersion: string): Promise<{ blob: Blob; filename: string; exportedAt: string }> {
  const data = await createBackup(appVersion);
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  return { blob, filename: `TrainingAudit_Backup_${data.exportedAt.slice(0, 10)}.json`, exportedAt: data.exportedAt };
}

/** Records the backup date for the home-screen reminder. */
export async function markBackedUp(exportedAt: string) {
  await setKV(KV.lastBackup, exportedAt);
}

/** Backup as a downloadable file. Records the backup date for the home-screen reminder. */
export async function exportBackupFile(appVersion: string): Promise<{ blob: Blob; filename: string }> {
  const { blob, filename, exportedAt } = await buildBackupFile(appVersion);
  await markBackedUp(exportedAt);
  return { blob, filename };
}

export function parseBackup(text: string): BackupFile {
  let o: any;
  try {
    o = JSON.parse(text);
  } catch {
    throw new Error('That file is not a backup file (it is not valid JSON).');
  }
  if (!o || o.app !== BACKUP_APP) throw new Error('That file is not a backup from this app.');
  if (typeof o.format !== 'number' || o.format > BACKUP_FORMAT) throw new Error('This backup was made by a newer version of the app. Update the app first.');
  if (!Array.isArray(o.audits) || !Array.isArray(o.photos) || typeof o.kv !== 'object') throw new Error('The backup file is incomplete or damaged.');
  for (const a of o.audits) if (!a?.id || !a.setup || !a.library) throw new Error('The backup file contains a damaged audit.');
  for (const p of o.photos) if (!p?.id || typeof p.data !== 'string') throw new Error('The backup file contains a damaged photo.');
  return o as BackupFile;
}

/** Replaces everything on the phone with the backup's contents. */
export async function restoreBackup(b: BackupFile) {
  // Decode photos first: nothing slow may happen inside the database transaction.
  const photos: PhotoRecord[] = b.photos.map(({ type, data, ...meta }) => ({ ...meta, blob: base64ToBlob(data, type) }));
  const d = await db();
  const tx = d.transaction(['kv', 'audits', 'photos'], 'readwrite');
  await Promise.all([tx.objectStore('kv').clear(), tx.objectStore('audits').clear(), tx.objectStore('photos').clear()]);
  for (const [k, v] of Object.entries(b.kv)) await tx.objectStore('kv').put(v, k);
  await tx.objectStore('kv').put(b.exportedAt, KV.lastBackup);
  for (const a of b.audits) await tx.objectStore('audits').put(a);
  for (const p of photos) await tx.objectStore('photos').put(p);
  await tx.done;
}

export function backupSummary(b: BackupFile): string {
  const finished = b.audits.filter((a) => a.status === 'finished').length;
  const drafts = b.audits.length - finished;
  return `${finished} finished audit${finished === 1 ? '' : 's'}, ${drafts} in progress, ${b.photos.length} photo${b.photos.length === 1 ? '' : 's'}${b.kv[KV.library] ? ', criteria library' : ''}`;
}
