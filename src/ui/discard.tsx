import type { Audit } from '../types';
import { deleteAudit } from '../lib/db';
import { auditTitle } from '../lib/audit';
import { scoreOf } from '../lib/scoring';
import { confirmDialog, go, toast } from './common';

/** Asks, then permanently deletes an unfinished audit with its photos. */
export async function discardAudit(a: Audit): Promise<boolean> {
  const rated = scoreOf(a).overall.counts.rated;
  const photos = Object.values(a.responses).reduce((n, r) => n + (r.photoIds?.length ?? 0), 0);
  const ok = await confirmDialog({
    title: 'Discard this audit?',
    body: (
      <>
        <p><b>{auditTitle(a)}</b> ({a.setup.level}) will be deleted from this phone.</p>
        <p>This removes {rated} rating{rated === 1 ? '' : 's'}, {photos} photo{photos === 1 ? '' : 's'}, all notes, actions and signatures. <b>This can't be undone.</b></p>
      </>
    ),
    ok: 'Discard audit',
    danger: true,
  });
  if (!ok) return false;
  await deleteAudit(a.id);
  toast('Audit discarded');
  go('/', true);
  return true;
}
