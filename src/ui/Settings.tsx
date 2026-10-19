import { useState } from 'preact/hooks';
import { getKV, importLibrary, KV } from '../lib/db';
import { downloadBlob } from '../lib/download';
import { alertDialog, confirmDialog, Icon, toast, TopBar } from './common';
import { useApp } from './app-state';
import { readLibraryFile } from './LoadLibrary';

export function Settings() {
  const { library, reload } = useApp();
  const [busy, setBusy] = useState(false);

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
            <p>This replaces your current library, including any edits you've made, with <b>{file.name}</b> ({lib.criteria.length} criteria).</p>
            <p>Audits you've already started or finished are not affected. They keep their own copy of the criteria.</p>
          </>
        ),
        ok: 'Replace',
        danger: true,
      });
      if (!ok) return;
      setBusy(true);
      await importLibrary(lib);
      await reload();
      toast('Criteria library imported');
    } catch (err) {
      await alertDialog('Import failed', <p>{(err as Error).message}</p>);
    } finally {
      setBusy(false);
    }
  }

  async function onExport() {
    const lib = library ?? (await getKV(KV.library));
    if (!lib) return;
    const blob = new Blob([JSON.stringify(lib, null, 2)], { type: 'application/json' });
    downloadBlob(blob, 'audit_criteria.json');
  }

  return (
    <>
      <TopBar title="Settings" back="/" />
      <main class="page">
        <section class="card">
          <h2>Criteria library</h2>
          <p class="muted small">
            {library ? `${library.library}${library.version ? ' v' + library.version : ''} · ${library.criteria.length} criteria in ${library.areas.length} areas` : 'No library loaded'}
          </p>
          <div class="row">
            <label class="btn ghost" aria-disabled={busy}>
              <Icon.upload /> Import
              <input class="visually-hidden" type="file" accept=".json,application/json" onChange={onImport} disabled={busy} />
            </label>
            <button class="btn ghost" onClick={onExport} disabled={!library}>Export</button>
          </div>
        </section>
        <p class="muted small" style={{ textAlign: 'center' }}>Training System Audit · version {__APP_VERSION__}</p>
      </main>
    </>
  );
}
