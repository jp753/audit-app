import { useEffect, useState } from 'preact/hooks';
import type { Brand } from '../types';
import { DEFAULT_BRAND } from '../types';
import { getKV, importLibrary, KV, setKV } from '../lib/db';
import { downloadBlob } from '../lib/download';
import { backupSummary, exportBackupFile, parseBackup, restoreBackup } from '../lib/backup';
import { formatDate } from '../lib/audit';
import type { Library } from '../types';
import { alertDialog, confirmDialog, go, Icon, toast, TopBar } from './common';
import { useApp } from './app-state';
import { readLibraryFile } from './LoadLibrary';

export function Settings() {
  const { library, brand, lastBackup, reload } = useApp();
  const [busy, setBusy] = useState('');
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
  }, []);

  // ---------- backup ----------
  async function backup() {
    setBusy('backup');
    try {
      const { blob, filename } = await exportBackupFile(__APP_VERSION__);
      downloadBlob(blob, filename);
      await reload();
      toast('Backup saved to Downloads');
    } catch (e) {
      await alertDialog('Backup failed', <p>{(e as Error).message}</p>);
    } finally {
      setBusy('');
    }
  }

  async function onRestore(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      setBusy('restore');
      const data = parseBackup(await file.text());
      setBusy('');
      const ok = await confirmDialog({
        title: 'Restore from backup?',
        body: (
          <>
            <p>Backup from <b>{formatDate(data.exportedAt)}</b>: {backupSummary(data)}.</p>
            <div class="notice bad">
              <b>Everything currently on this phone will be replaced</b>: all audits, records, photos, brand settings and the criteria library. This can't be undone.
            </div>
            <p class="small">Tip: make a backup of the current data first if you might need it.</p>
          </>
        ),
        ok: 'Replace everything',
        danger: true,
      });
      if (!ok) return;
      setBusy('restore');
      await restoreBackup(data);
      await reload();
      toast('Backup restored');
      go('/', true);
    } catch (err) {
      await alertDialog('Restore failed', <p>{(err as Error).message}</p>);
    } finally {
      setBusy('');
    }
  }

  // ---------- criteria library ----------
  async function onImport(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const lib = await readLibraryFile(file);
      const ok = await confirmDialog({
        title: 'Replace criteria library?',
        body: (
          <>
            <p>This replaces your current library, including any edits you've made, with <b>{file.name}</b> ({lib.criteria.length} criteria in {lib.areas.length} areas).</p>
            <p>Audits already started or finished are not affected. They keep their own copy of the criteria.</p>
          </>
        ),
        ok: 'Replace',
        danger: true,
      });
      if (!ok) return;
      await importLibrary(lib);
      await reload();
      toast('Criteria library imported');
    } catch (err) {
      await alertDialog('Import failed', <p>{(err as Error).message}</p>);
    }
  }

  async function onExport() {
    if (!library) return;
    downloadBlob(new Blob([JSON.stringify(library, null, 2)], { type: 'application/json' }), 'audit_criteria.json');
  }

  async function onReset() {
    const imported = await getKV<Library>(KV.importedLibrary);
    if (!imported) return alertDialog('Nothing to reset to', <p>No imported library was found.</p>);
    const ok = await confirmDialog({
      title: 'Reset library to imported version?',
      body: <p>All edits, added criteria and switched-off criteria since your last import will be undone. Audits already started or finished are not affected.</p>,
      ok: 'Reset library',
      danger: true,
    });
    if (!ok) return;
    await setKV(KV.library, imported);
    await reload();
    toast('Library reset');
  }

  const active = library?.criteria.filter((c) => !c.off).length ?? 0;

  return (
    <>
      <TopBar title="Settings" back="/" />
      <main class="page">
        <section class="card">
          <h2>Backup and restore</h2>
          <p class="small">Last backup: <b>{lastBackup ? formatDate(lastBackup) : 'never'}</b>. The backup is one file with all your audits, records, photos, settings and criteria library. Save a copy to your PC.</p>
          <div style={{ display: 'grid', gap: 10 }}>
            <button class="btn primary block" onClick={backup} disabled={!!busy}>{busy === 'backup' ? 'Creating backup…' : 'Back up everything'}</button>
            <label class="btn ghost block" aria-disabled={!!busy}>
              <Icon.upload /> {busy === 'restore' ? 'Restoring…' : 'Restore from backup file'}
              <input class="visually-hidden" type="file" accept=".json,application/json" onChange={onRestore} disabled={!!busy} />
            </label>
          </div>
        </section>

        <BrandSettings brand={brand} onSaved={reload} />

        <section class="card">
          <h2>Criteria library</h2>
          <p class="small muted">
            {library ? `${library.library}${library.version ? ' v' + library.version : ''} · ${active} of ${library.criteria.length} criteria switched on, in ${library.areas.length} areas` : 'No library loaded'}
          </p>
          <p class="small">Every audit keeps a copy of the criteria it used, so edits here never change past audits or their reports.</p>
          <div style={{ display: 'grid', gap: 10 }}>
            <button class="btn primary block" onClick={() => go('/library')} disabled={!library}><Icon.edit /> Edit criteria</button>
            <label class="btn ghost block">
              <Icon.upload /> Import criteria library
              <input class="visually-hidden" type="file" accept=".json,application/json" onChange={onImport} />
            </label>
            <button class="btn ghost block" onClick={onExport} disabled={!library}>Export criteria library</button>
            <button class="btn ghost block" onClick={onReset} disabled={!library}>Reset library to imported version</button>
          </div>
        </section>

        <section class="card small">
          <h2>About</h2>
          <p>Training System Audit · version {__APP_VERSION__}</p>
          <p>Everything is stored on this phone only. No accounts, no cloud, no tracking.</p>
          <p>Storage protection: {persisted === null ? 'unknown' : persisted ? 'on (Android will not clear the app data)' : 'not granted yet. Installing the app to your home screen usually turns it on.'}</p>
        </section>
      </main>
    </>
  );
}

function BrandSettings(props: { brand: Brand; onSaved: () => Promise<void> }) {
  const [b, setB] = useState<Brand>(props.brand);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { setB(props.brand); setDirty(false); }, [props.brand]);
  const set = <K extends keyof Brand>(k: K, v: Brand[K]) => { setB((o) => ({ ...o, [k]: v })); setDirty(true); };

  async function save() {
    const clean = { ...b, name: b.name.trim(), tagline: b.tagline.trim(), monogram: b.monogram.trim().slice(0, 2).toUpperCase() };
    await setKV(KV.brand, clean);
    await props.onSaved();
    toast('Brand saved');
  }

  async function onLogo(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      set('logo', await logoToPng(file));
    } catch {
      alertDialog('Logo not added', <p>That image could not be read. Try a PNG or JPEG file.</p>);
    }
  }

  return (
    <section class="card">
      <h2>Brand</h2>
      <label class="field"><span>Name</span><input type="text" value={b.name} onInput={(e) => set('name', e.currentTarget.value)} /></label>
      <label class="field"><span>Tagline</span><input type="text" value={b.tagline} onInput={(e) => set('tagline', e.currentTarget.value)} /></label>
      <label class="field"><span>Monogram (two letters)</span><input type="text" maxLength={2} value={b.monogram} onInput={(e) => set('monogram', e.currentTarget.value.toUpperCase())} /></label>
      <div class="field">
        <span>Logo (optional, replaces the monogram)</span>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div class="monogram">{b.logo ? <img src={b.logo} alt="Logo" /> : b.monogram}</div>
          <label class="btn ghost" style={{ flex: 1 }}>
            {b.logo ? 'Change logo' : 'Upload logo'}
            <input class="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={onLogo} />
          </label>
          {b.logo && <button class="btn ghost" onClick={() => set('logo', '')}>Remove</button>}
        </div>
      </div>
      <div class="field">
        <span>Colours</span>
        <div class="row">
          {(['navy', 'teal', 'amber'] as const).map((k) => (
            <label style={{ flex: 1, textAlign: 'center' }}>
              <input type="color" value={b[k]} onInput={(e) => set(k, e.currentTarget.value)} style={{ width: '100%', height: 52, border: '2px solid var(--line)', borderRadius: 12, padding: 2, background: '#fff' }} />
              <span class="small" style={{ display: 'block', textTransform: 'capitalize' }}>{k === 'navy' ? 'Main' : k === 'teal' ? 'Accent' : 'Highlight'}</span>
            </label>
          ))}
        </div>
        <button class="btn ghost" style={{ marginTop: 10, minHeight: 44 }} onClick={() => { set('navy', DEFAULT_BRAND.navy); set('teal', DEFAULT_BRAND.teal); set('amber', DEFAULT_BRAND.amber); }}>
          Default colours
        </button>
      </div>
      <button class="btn primary block" disabled={!dirty} onClick={save}>Save brand</button>
    </section>
  );
}

/** Logo as a PNG data URL, at most 600px wide, for the app and PDFs. */
async function logoToPng(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}
