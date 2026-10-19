// Android's share menu (email, WhatsApp, Google Drive…). No network needed to open it.

export function canShareFiles(): boolean {
  try {
    const probe = new File(['x'], 'probe.txt', { type: 'text/plain' });
    return typeof navigator.share === 'function' && !!navigator.canShare?.({ files: [probe] });
  } catch {
    return false;
  }
}

/** Returns false if the person closed the share menu without sharing. */
export async function shareFiles(files: File[], title: string, text?: string): Promise<boolean> {
  try {
    await navigator.share({ files, title, text });
    return true;
  } catch (e) {
    if ((e as Error).name === 'AbortError') return false;
    throw e;
  }
}

/** Only the files this phone's share menu accepts. */
export function shareableOnly(files: File[]): File[] {
  return files.filter((f) => {
    try {
      return !!navigator.canShare?.({ files: [f] });
    } catch {
      return false;
    }
  });
}

/**
 * A backup file that the share menu will accept. Chrome does not share .json
 * files, so it falls back to the same content as a .txt file (restore accepts both).
 */
export function shareableBackup(blob: Blob, jsonName: string): File {
  const json = new File([blob], jsonName, { type: 'application/json' });
  if (shareableOnly([json]).length) return json;
  return new File([blob], jsonName.replace(/\.json$/, '.txt'), { type: 'text/plain' });
}
