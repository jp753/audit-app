import { useEffect, useState } from 'preact/hooks';
import type { Audit } from '../types';
import { allAudits, deleteAudit } from '../lib/db';
import { auditTitle, formatDate } from '../lib/audit';
import { scoreOf } from '../lib/scoring';
import { confirmDialog, go, Icon, TopBar } from './common';

export function ContinueList() {
  const [list, setList] = useState<Audit[] | null>(null);
  const load = () =>
    allAudits().then((all) =>
      setList(all.filter((a) => a.status === 'draft').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))),
    );
  useEffect(() => { load(); }, []);

  async function remove(a: Audit) {
    const ok = await confirmDialog({
      title: 'Delete this audit in progress?',
      body: <p>{auditTitle(a)} will be deleted, including its ratings and photos. This can't be undone.</p>,
      ok: 'Delete',
      danger: true,
    });
    if (ok) { await deleteAudit(a.id); load(); }
  }

  return (
    <>
      <TopBar title="Continue audit" back="/" />
      <main class="page">
        {list && list.length === 0 && <p class="empty">No audits in progress.</p>}
        {list?.map((a) => {
          const r = scoreOf(a);
          return (
            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
              <button class="listitem" onClick={() => go(`/audit/${a.id}${a.lastArea ? '/' + a.lastArea : ''}`)}>
                <b>{auditTitle(a)}</b>
                <span class="meta">
                  {a.setup.level} · {formatDate(a.setup.date)} · {r.overall.counts.rated} of {r.overall.counts.inScope} rated
                </span>
              </button>
              <button class="iconbtn" style={{ height: 'auto', color: 'var(--notmet)' }} aria-label="Delete" onClick={() => remove(a)}>
                <Icon.trash />
              </button>
            </div>
          );
        })}
      </main>
    </>
  );
}
