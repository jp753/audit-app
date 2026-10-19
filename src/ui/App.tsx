import { useEffect, useState } from 'preact/hooks';
import type { Brand, Library } from '../types';
import { DEFAULT_BRAND } from '../types';
import { getBrand, getKV, getLibrary, KV, requestPersistence } from '../lib/db';
import { AppCtx } from './app-state';
import { useHash } from './common';
import { Home } from './Home';
import { LoadLibrary } from './LoadLibrary';
import { Setup } from './Setup';
import { ContinueList } from './ContinueList';
import { Auditing } from './Auditing';
import { Settings } from './Settings';
import { Review } from './Review';
import { Records, RecordView } from './Records';
import { LibraryEditor } from './LibraryEditor';

export function App() {
  const hash = useHash();
  const [ready, setReady] = useState(false);
  const [library, setLibrary] = useState<Library | undefined>();
  const [brand, setBrand] = useState<Brand>(DEFAULT_BRAND);
  const [lastBackup, setLastBackup] = useState<string | undefined>();

  async function reload() {
    const [lib, b, lb] = await Promise.all([getLibrary(), getBrand(), getKV<string>(KV.lastBackup)]);
    setLibrary(lib);
    setBrand(b);
    setLastBackup(lb);
    setReady(true);
  }

  useEffect(() => {
    reload();
    requestPersistence();
  }, []);

  // Brand colours drive the whole app's look.
  useEffect(() => {
    const s = document.documentElement.style;
    s.setProperty('--navy', brand.navy);
    s.setProperty('--teal', brand.teal);
    s.setProperty('--amber', brand.amber);
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', brand.navy);
  }, [brand]);

  if (!ready) return null;

  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [route, a1, a2] = parts;

  let screen;
  if (!library && !['settings', 'records', 'record'].includes(route)) screen = <LoadLibrary />;
  else if (route === 'new') screen = <Setup />;
  else if (route === 'setup' && a1) screen = <Setup id={a1} />;
  else if (route === 'continue') screen = <ContinueList />;
  else if (route === 'audit' && a1) screen = <Auditing id={a1} area={a2} key={a1} />;
  else if (route === 'settings') screen = <Settings />;
  else if (route === 'library') screen = <LibraryEditor />;
  else if (route === 'review' && a1) screen = <Review id={a1} key={a1} />;
  else if (route === 'records') screen = <Records />;
  else if (route === 'record' && a1) screen = <RecordView id={a1} key={a1} />;
  else screen = <Home />;

  return <AppCtx.Provider value={{ library, brand, lastBackup, reload }}>{screen}</AppCtx.Provider>;
}
