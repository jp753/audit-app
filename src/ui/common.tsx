import type { ComponentChildren } from 'preact';
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

// ---------- tiny hash router ----------
export function useHash(): string {
  const [h, setH] = useState(location.hash || '#/');
  useEffect(() => {
    const f = () => { setH(location.hash || '#/'); window.scrollTo(0, 0); };
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, []);
  return h;
}
export function go(path: string, replace = false) {
  const h = path.startsWith('#') ? path : `#${path}`;
  if (replace) location.replace(h);
  else location.hash = h;
}

// ---------- icons (inline so they work offline) ----------
const svg = (d: ComponentChildren) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{d}</svg>
);
export const Icon = {
  back: () => svg(<path d="M15 18l-6-6 6-6" />),
  next: () => svg(<path d="M9 18l6-6-6-6" />),
  gear: () => svg(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>),
  plus: () => svg(<path d="M12 5v14M5 12h14" />),
  play: () => svg(<path d="M6 4l14 8-14 8z" />),
  archive: () => svg(<><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" /></>),
  camera: () => svg(<><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></>),
  image: () => svg(<><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></>),
  edit: () => svg(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>),
  upload: () => svg(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5M12 3v12" /></>),
  check: () => svg(<path d="M20 6L9 17l-5-5" />),
  trash: () => svg(<><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></>),
  list: () => svg(<><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="3.5" cy="6" r="1" /><circle cx="3.5" cy="12" r="1" /><circle cx="3.5" cy="18" r="1" /></>),
};

// ---------- layout ----------
export function TopBar(props: { title: string; sub?: string; back?: string | (() => void); right?: ComponentChildren }) {
  const onBack = () => (typeof props.back === 'function' ? props.back() : go(props.back!));
  return (
    <header class="topbar">
      {props.back ? (
        <button class="iconbtn" onClick={onBack} aria-label="Back"><Icon.back /></button>
      ) : <span style={{ width: 8 }} />}
      <h1>{props.title}{props.sub && <span class="sub">{props.sub}</span>}</h1>
      {props.right}
    </header>
  );
}

// ---------- dialogs ----------
export function Sheet(props: { onClose?: () => void; children: ComponentChildren; label?: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') props.onClose?.(); };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, []);
  return (
    <div class="overlay" onClick={(e) => { if (e.target === e.currentTarget) props.onClose?.(); }}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label={props.label}>{props.children}</div>
    </div>
  );
}

function mountSheet<T>(build: (done: (v: T) => void) => ComponentChildren): Promise<T> {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const done = (v: T) => { render(null, host); host.remove(); resolve(v); };
    render(<>{build(done)}</>, host);
  });
}

export function confirmDialog(opts: { title: string; body?: ComponentChildren; ok?: string; cancel?: string; danger?: boolean }): Promise<boolean> {
  return mountSheet<boolean>((done) => (
    <Sheet onClose={() => done(false)} label={opts.title}>
      <h2>{opts.title}</h2>
      {opts.body && <div>{opts.body}</div>}
      <div class="row">
        <button class="btn ghost" onClick={() => done(false)}>{opts.cancel ?? 'Cancel'}</button>
        <button class={`btn ${opts.danger ? 'danger' : 'primary'}`} onClick={() => done(true)}>{opts.ok ?? 'OK'}</button>
      </div>
    </Sheet>
  ));
}

export function alertDialog(title: string, body?: ComponentChildren): Promise<void> {
  return mountSheet<void>((done) => (
    <Sheet onClose={() => done()} label={title}>
      <h2>{title}</h2>
      {body && <div>{body}</div>}
      <div class="row"><button class="btn primary" onClick={() => done()}>OK</button></div>
    </Sheet>
  ));
}

let toastTimer: number | undefined;
export function toast(msg: string) {
  let el = document.querySelector<HTMLDivElement>('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el?.remove(), 2600);
}

/** Read a file the user picked as text. */
export function readFileText(file: File): Promise<string> {
  return file.text();
}
