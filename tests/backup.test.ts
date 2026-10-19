import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import sample from './fixtures/sample_library.json';
import { parseLibrary } from '../src/lib/library';
import { blankSetup, emptyResponse, newAudit } from '../src/lib/audit';
import { allAudits, db, finishAudit, getBrand, getKV, importLibrary, KV, resetDbConnection, saveAudit, savePhoto, setKV } from '../src/lib/db';
import { createBackup, parseBackup, restoreBackup } from '../src/lib/backup';
import { DEFAULT_BRAND } from '../src/types';

async function wipe() {
  const d = await db();
  await Promise.all([d.clear('kv'), d.clear('audits'), d.clear('photos')]);
}

async function snapshotAll() {
  const d = await db();
  const kv: Record<string, unknown> = {};
  for (const k of await d.getAllKeys('kv')) kv[k as string] = await d.get('kv', k as string);
  const audits = (await d.getAll('audits')).sort((a, b) => a.id.localeCompare(b.id));
  const photos = await Promise.all((await d.getAll('photos')).map(async (p) => ({ ...p, blob: [p.blob.type, Buffer.from(await p.blob.arrayBuffer()).toString('hex')] })));
  photos.sort((a, b) => a.id.localeCompare(b.id));
  return { kv, audits, photos };
}

describe('backup and restore', () => {
  beforeEach(async () => {
    resetDbConnection();
    await wipe();
  });

  it('restores everything exactly', async () => {
    const lib = parseLibrary(structuredClone(sample));
    await importLibrary(lib);
    const edited = structuredClone(lib);
    edited.criteria[0].text = 'Edited wording';
    await setKV(KV.library, edited);
    await setKV(KV.brand, { ...DEFAULT_BRAND, tagline: 'Custom tagline', navy: '#112233' });

    const a1 = newAudit(edited, { ...blankSetup(), client: 'Acme', site: 'Leeds' });
    a1.responses.P1 = { ...emptyResponse(), rating: 'Partial', notes: 'Some evidence', action: 'Do it', owner: 'Ann', due: '2026-11-30', photoIds: ['ph1', 'ph2'] };
    a1.signatures.client = { name: 'Bob', role: 'Ops', image: 'data:image/png;base64,AAAA', signedAt: '2026-10-19T10:00:00.000Z' };
    await saveAudit(a1);
    await finishAudit(a1);
    const a2 = newAudit(edited, { ...blankSetup(), client: 'Beta', site: 'York' });
    a2.responses.Q1 = { ...emptyResponse(), rating: 'Met' };
    await saveAudit(a2);
    const bytes = new Uint8Array(5000).map((_, i) => (i * 37) % 256);
    await savePhoto({ id: 'ph1', auditId: a1.id, criterionId: 'P1', blob: new Blob([bytes], { type: 'image/jpeg' }), width: 1600, height: 1200, createdAt: '2026-10-19T09:00:00.000Z' });
    await savePhoto({ id: 'ph2', auditId: a1.id, criterionId: 'P1', blob: new Blob([bytes.slice(0, 77)], { type: 'image/jpeg' }), width: 800, height: 600, createdAt: '2026-10-19T09:01:00.000Z' });

    const before = await snapshotAll();
    const file = JSON.stringify(await createBackup('1.0', new Date('2026-10-19T12:00:00Z')));

    // Wipe and change things, then restore.
    await wipe();
    await saveAudit(newAudit(lib, { ...blankSetup(), client: 'Should disappear', site: 'X' }));
    await restoreBackup(parseBackup(file));

    const after = await snapshotAll();
    expect(after.audits).toEqual(before.audits);
    expect(after.photos).toEqual(before.photos);
    const { lastBackup, ...kvAfter } = after.kv as any;
    expect(kvAfter).toEqual(before.kv);
    expect(lastBackup).toBe('2026-10-19T12:00:00.000Z');
    expect((await getBrand()).tagline).toBe('Custom tagline');
    expect((await getKV<any>(KV.library)).criteria[0].text).toBe('Edited wording');
    expect((await allAudits()).find((a) => a.id === a1.id)!.status).toBe('finished');
  });

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('not json')).toThrow(/not a backup/);
    expect(() => parseBackup(JSON.stringify({ app: 'other' }))).toThrow(/not a backup/);
    expect(() => parseBackup(JSON.stringify({ app: 'training-system-audit', format: 99, audits: [], photos: [], kv: {} }))).toThrow(/newer version/);
  });

  it('a finished audit is locked and cannot be overwritten', async () => {
    const lib = parseLibrary(structuredClone(sample));
    const a = newAudit(lib, { ...blankSetup(), client: 'Acme', site: 'Leeds' });
    await saveAudit(a);
    await finishAudit(a);
    a.responses.P1 = { ...emptyResponse(), rating: 'Met' };
    await expect(saveAudit(a)).rejects.toThrow(/locked/);
  });
});
