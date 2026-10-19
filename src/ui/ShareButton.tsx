import { useState } from 'preact/hooks';
import { shareFiles } from '../lib/share';
import { alertDialog, toast } from './common';

/**
 * Two taps: "Prepare" builds the files, then "Share" opens Android's share menu.
 * (Android only opens the share menu straight after a tap, and building PDFs can take a few seconds.)
 */
export function ShareButton(props: {
  label: string;
  prepare: () => Promise<File[]>;
  title: string;
  text?: string;
  onShared?: () => void;
  disabled?: boolean;
}) {
  const [state, setState] = useState<'idle' | 'preparing' | 'ready'>('idle');
  const [files, setFiles] = useState<File[]>([]);

  async function prepare() {
    setState('preparing');
    try {
      setFiles(await props.prepare());
      setState('ready');
    } catch (e) {
      setState('idle');
      await alertDialog('Could not prepare the files', <p>{(e as Error).message}</p>);
    }
  }

  async function share() {
    try {
      const shared = await shareFiles(files, props.title, props.text);
      if (shared) { toast('Shared'); props.onShared?.(); }
    } catch (e) {
      await alertDialog('Could not share', <p>{(e as Error).message}</p>);
    } finally {
      setState('idle');
      setFiles([]);
    }
  }

  if (state === 'ready') {
    return <button class="btn primary block" onClick={share}>Tap to share ({files.length} file{files.length === 1 ? '' : 's'})</button>;
  }
  return (
    <button class="btn ghost block" disabled={props.disabled || state === 'preparing'} onClick={prepare}>
      {state === 'preparing' ? 'Preparing…' : props.label}
    </button>
  );
}
