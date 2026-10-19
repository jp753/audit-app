import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Audit } from '../types';
import { allAudits, deleteAudit, getAudit, getPhoto, saveAudit } from '../lib/db';
import { auditTitle, formatDate, reauditFrom, sameScope } from '../lib/audit';
import { canShareFiles, shareableOnly } from '../lib/share';
import { ShareButton } from './ShareButton';
import { formatPct, scoreOf } from '../lib/scoring';
import { downloadBlob } from '../lib/download';
import { fileBase } from '../lib/filenames';
import { alertDialog, confirmDialog, go, Icon, toast, TopBar } from './common';
import { ResultView } from './ResultView';
import { useApp } from './app-state';

/** Archive of finished audits, grouped by client, then site, then date. */
export function Records() {
  const [list, setList] = useState<Audit[] | null>(null);
  useEffect(() => { allAudits().then((all) => setList(all.filter((a) => a.status === 'finished'))); }, []);

  const groups = useMemo(() => {
    const byClient = new Map<string, Map<string, Audit[]>>();
    for (const a of list ?? []) {
      const c = a.setup.client.trim() || 'Untitled client';
      const s = a.setup.site.trim() || 'No site';
      if (!byClient.has(c)) byClient.set(c, new Map());
      const sites = byClient.get(c)!;
      if (!sites.has(s)) sites.set(s, []);
      sites.get(s)!.push(a);
    }
    const sortStr = (x: string, y: string) => x.localeCompare(y, undefined, { sensitivity: 'base' });
    return [...byClient.entries()].sort((x, y) => sortStr(x[0], y[0])).map(([client, sites]) => ({
      client,
      sites: [...sites.entries()].sort((x, y) => sortStr(x[0], y[0])).map(([site, audits]) => ({
        site,
        audits: audits.sort((x, y) => y.setup.date.localeCompare(x.setup.date) || (y.finishedAt ?? '').localeCompare(x.finishedAt ?? '')),
      })),
    }));
  }, [list]);

  return (
    <>
      <TopBar title="Records" back="/" />
      <main class="page">
        {list && list.length === 0 && <p class="empty">No finished audits yet. Finished audits appear here, locked.</p>}
        {groups.map((g) => (
          <section class="group">
            <h2>{g.client}</h2>
            {g.sites.map((s) => (
              <>
                <h3>{s.site}</h3>
                {s.audits.map((a) => {
                  const r = scoreOf(a);
                  const where = [a.setup.level, a.setup.department, a.setup.subDepartment].filter(Boolean).join(' · ');
                  return (
                    <button class="listitem" onClick={() => go(`/record/${a.id}`)}>
                      <b>{formatDate(a.setup.date)} · {formatPct(r.overall.pct)}{r.overall.maturity ? ` · ${r.overall.maturity.name}` : ''}</b>
                      <span class="meta">{where} · {r.gaps.length} gap{r.gaps.length === 1 ? '' : 's'}</span>
                    </button>
                  );
                })}
              </>
            ))}
          </section>
        ))}
      </main>
    </>
  );
}

/** One finished (locked, read-only) audit. */
export function RecordView(props: { id: string }) {
  const { library, brand } = useApp();
  const [audit, setAudit] = useState<Audit | null>(null);
  const [busy, setBusy] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [history, setHistory] = useState<Audit[]>([]);

  useEffect(() => {
    getAudit(props.id).then((a) => {
      if (!a) return go('/records', true);
      if (a.status !== 'finished') return go(`/audit/${a.id}`, true);
      setAudit(a);
      allAudits().then((all) => setHistory(
        all.filter((x) => x.status === 'finished' && sameScope(x.setup, a.setup))
          .sort((x, y) => x.setup.date.localeCompare(y.setup.date) || (x.finishedAt ?? '').localeCompare(y.finishedAt ?? '')),
      ));
    });
  }, [props.id]);

  const result = useMemo(() => (audit ? scoreOf(audit) : null), [audit]);
  if (!audit || !result) return <TopBar title="Loading…" back="/records" />;
  const s = audit.setup;

  async function download(kind: 'report' | 'actionsPdf' | 'actionsXlsx') {
    setBusy(kind);
    try {
      const out = await import('../lib/outputs');
      const base = fileBase(audit!);
      if (kind === 'report') downloadBlob(await out.reportPdf(audit!, brand), `${base}_Report.pdf`);
      if (kind === 'actionsPdf') downloadBlob(await out.actionsPdf(audit!, brand), `${base}_Actions.pdf`);
      if (kind === 'actionsXlsx') downloadBlob(await out.actionsXlsx(audit!, brand), `${base}_Actions.xlsx`);
    } catch (e) {
      console.error(e);
      await alertDialog('Could not create the file', <p>{(e as Error).message}</p>);
    } finally {
      setBusy('');
    }
  }

  async function reaudit() {
    if (!library) return toast('Load a criteria library first (Settings).');
    const ok = await confirmDialog({
      title: 'Start a re-audit?',
      body: <p>A new audit is started with the same client details ({auditTitle(audit!)}, {s.level}). No ratings, notes, photos or actions are copied. It uses your current criteria library and will be compared with this audit.</p>,
      ok: 'Start re-audit',
    });
    if (!ok) return;
    const a = reauditFrom(audit!, library);
    await saveAudit(a);
    go(`/setup/${a.id}`);
  }

  async function remove() {
    const ok = await confirmDialog({
      title: 'Delete this record?',
      body: (
        <>
          <p><b>{auditTitle(audit!)}</b>, {s.level}, {formatDate(s.date)}.</p>
          <p>The audit, its photos and signatures will be permanently deleted from this phone. Reports you've already downloaded are not affected. <b>This can't be undone.</b></p>
        </>
      ),
      ok: 'Delete permanently',
      danger: true,
    });
    if (!ok) return;
    await deleteAudit(audit!.id);
    toast('Record deleted');
    go('/records', true);
  }

  return (
    <>
      <TopBar title={auditTitle(audit)} sub={`${s.level} · ${formatDate(s.date)}`} back="/records" />
      <main class="page">
        <p><span class="lockbadge">🔒 Finished {audit.finishedAt ? formatDate(audit.finishedAt) : ''} · read-only</span></p>

        <div class="card">
          <h3 style={{ marginTop: 0 }}>Downloads</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            <button class="btn primary block" disabled={!!busy} onClick={() => download('report')}>
              {busy === 'report' ? 'Creating report…' : 'Client report (PDF)'}
            </button>
            <button class="btn teal block" disabled={!!busy} onClick={() => download('actionsPdf')}>
              {busy === 'actionsPdf' ? 'Creating…' : 'Action list (PDF)'}
            </button>
            <button class="btn teal block" disabled={!!busy} onClick={() => download('actionsXlsx')}>
              {busy === 'actionsXlsx' ? 'Creating…' : 'Action list (Excel)'}
            </button>
            {canShareFiles() && (
              <ShareButton
                label="Share report and action list"
                title={`Training System Audit – ${s.client} – ${s.site}`}
                text={`Training System Audit report and action list – ${s.client}, ${s.site}, ${formatDate(s.date)}`}
                disabled={!!busy}
                prepare={async () => {
                  const out = await import('../lib/outputs');
                  const base = fileBase(audit!);
                  const [r, ap, ax] = await Promise.all([out.reportPdf(audit!, brand), out.actionsPdf(audit!, brand), out.actionsXlsx(audit!, brand)]);
                  // Excel is included only where the phone's share menu accepts it.
                  return shareableOnly([
                    new File([r], `${base}_Report.pdf`, { type: 'application/pdf' }),
                    new File([ap], `${base}_Actions.pdf`, { type: 'application/pdf' }),
                    new File([ax], `${base}_Actions.xlsx`, { type: ax.type }),
                  ]);
                }}
              />
            )}
          </div>
        </div>

        {history.length > 1 && (
          <div class="card">
            <h3 style={{ marginTop: 0 }}>Score history ({history.length} audits)</h3>
            <p class="small muted">All finished audits for this client, site and level.</p>
            {history.map((h) => {
              const pct = scoreOf(h).overall.pct;
              return (
                <button class={`history-row ${h.id === audit.id ? 'current' : ''}`} style={{ width: '100%', border: 0, background: 'none', padding: 0, textAlign: 'left', color: 'inherit' }}
                  onClick={() => h.id !== audit.id && go(`/record/${h.id}`)} aria-label={`${formatDate(h.setup.date)} ${formatPct(pct)}`}>
                  <span>{formatDate(h.setup.date)}</span>
                  <span class="hb"><div style={{ width: `${pct ?? 0}%` }} /></span>
                  <span style={{ textAlign: 'right' }}>{formatPct(pct)}</span>
                </button>
              );
            })}
          </div>
        )}

        <ResultView audit={audit} result={result} prev={audit.previous} />

        <h3>Audit details</h3>
        <div class="card small">
          <Detail k="Client" v={s.client} />
          <Detail k="Site" v={s.site} />
          <Detail k="Level" v={s.level} />
          {s.department && <Detail k="Department" v={s.department} />}
          {s.subDepartment && <Detail k="Sub-department" v={s.subDepartment} />}
          <Detail k="Lead assessor" v={s.assessor} />
          <Detail k="Audit date" v={formatDate(s.date)} />
          {s.scope && <Detail k="Scope" v={s.scope} />}
          {s.notes && <Detail k="Notes" v={s.notes} />}
          <Detail k="Criteria" v={`${audit.library.library}${audit.library.version ? ' v' + audit.library.version : ''}`} />
        </div>

        <button class="btn ghost block" onClick={() => setShowAll(!showAll)}>
          <Icon.list /> {showAll ? 'Hide all ratings' : 'Show all ratings and evidence'}
        </button>
        {showAll && <AllRatings audit={audit} />}

        <h3>Actions</h3>
        <div style={{ display: 'grid', gap: 10 }}>
          <button class="btn ghost block" onClick={reaudit}>Duplicate as re-audit</button>
          <button class="btn danger block" onClick={remove}><Icon.trash /> Delete record</button>
        </div>
      </main>
    </>
  );
}

function Detail(props: { k: string; v: string }) {
  return <p style={{ margin: '0 0 6px', whiteSpace: 'pre-wrap' }}><b>{props.k}:</b> {props.v}</p>;
}

function AllRatings(props: { audit: Audit }) {
  const r = scoreOf(props.audit);
  return (
    <div style={{ marginTop: 12 }}>
      {r.areas.filter((a) => a.hasScope).map((a) => (
        <div class="card">
          <h3 style={{ marginTop: 0 }}>{a.code}. {a.name} · {formatPct(a.result.pct)}</h3>
          {a.criteria.map((c) => {
            const resp = props.audit.responses[c.id];
            return (
              <div style={{ borderTop: '1px solid var(--line)', padding: '8px 0' }}>
                <div><b>{c.id}</b> {c.critical && <span class="badge critical">CRITICAL</span>} <span class="badge">{resp?.rating ?? 'Not assessed'}</span></div>
                <div class="small">{c.text}</div>
                {resp?.notes && <div class="small muted" style={{ whiteSpace: 'pre-wrap' }}>Evidence: {resp.notes}</div>}
                {resp?.photoIds?.length ? <RecordPhotos ids={resp.photoIds} /> : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function RecordPhotos(props: { ids: string[] }) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const made: string[] = [];
    Promise.all(props.ids.map(getPhoto)).then((ps) => {
      for (const p of ps) if (p) made.push(URL.createObjectURL(p.blob));
      setUrls([...made]);
    });
    return () => made.forEach((u) => URL.revokeObjectURL(u));
  }, [props.ids.join()]);
  return <div class="photos">{urls.map((u) => <span class="thumb"><img src={u} alt="" /></span>)}</div>;
}
