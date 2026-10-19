import { useState } from 'preact/hooks';
import { parseLibrary } from '../lib/library';
import { importLibrary } from '../lib/db';
import type { Library } from '../types';
import { Icon } from './common';
import { useApp } from './app-state';

/** Reads and checks a criteria JSON file the user picked. */
export async function readLibraryFile(file: File): Promise<Library> {
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    throw new Error('That file is not valid JSON. Pick your audit_criteria.json file.');
  }
  return parseLibrary(raw);
}

/** First-launch screen: the app ships with no criteria built in. */
export function LoadLibrary() {
  const { brand, reload } = useApp();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onPick(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const lib = await readLibraryFile(file);
      await importLibrary(lib);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main class="page">
      <div class="brandhead">
        <div class="monogram">{brand.logo ? <img src={brand.logo} alt="" /> : brand.monogram}</div>
        <div><div class="name">{brand.name}</div><div class="tag">{brand.tagline}</div></div>
      </div>
      <div class="card">
        <h2>Load criteria library</h2>
        <p>This app has no audit criteria built in. Import your <b>audit_criteria.json</b> file from your phone to get started.</p>
        <p class="muted small">The criteria stay on this phone only. They are included in your backup file.</p>
        {error && <div class="notice bad">{error}</div>}
        <label class="btn primary block" aria-disabled={busy}>
          <Icon.upload /> {busy ? 'Importing…' : 'Choose criteria file'}
          <input class="visually-hidden" type="file" accept=".json,application/json" onChange={onPick} disabled={busy} />
        </label>
      </div>
      <div class="card">
        <h2>New phone?</h2>
        <p class="small">If you have a backup file from this app, restore it instead. It brings back your criteria, audits, records and photos.</p>
        <a class="btn ghost block" href="#/settings">Restore from a backup</a>
      </div>
    </main>
  );
}
