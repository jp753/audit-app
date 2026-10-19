import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Audit, Signature } from '../types';
import { allAudits, finishAudit, getAudit, saveAudit } from '../lib/db';
import { auditTitle, formatDate } from '../lib/audit';
import { comparisonCandidates, summarise } from '../lib/compare';
import { formatPct, scoreOf } from '../lib/scoring';
import { confirmDialog, go, toast, TopBar } from './common';
import { ResultView } from './ResultView';
import { SignaturePad } from './SignaturePad';
import { discardAudit } from './discard';

export function Review(props: { id: string }) {
  const [audit, setAudit] = useState<Audit | null>(null);
  const [candidates, setCandidates] = useState<Audit[]>([]);
  const latest = useRef<Audit | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    (async () => {
      const a = await getAudit(props.id);
      if (!a) return go('/', true);
      if (a.status === 'finished') return go(`/record/${a.id}`, true);
      const cands = comparisonCandidates(a, await allAudits());
      // Offer the most recent matching audit by default; "None" is one tap away.
      if (a.compareWithId === undefined && cands.length) a.compareWithId = cands[0].id;
      if (a.compareWithId && !cands.some((c) => c.id === a.compareWithId)) a.compareWithId = cands[0]?.id ?? null;
      latest.current = a;
      setCandidates(cands);
      setAudit(a);
    })();
    return () => { if (timer.current !== undefined) flush(); };
  }, [props.id]);

  async function flush() {
    clearTimeout(timer.current);
    timer.current = undefined;
    if (latest.current) await saveAudit(latest.current);
  }
  function update(fn: (a: Audit) => Audit) {
    latest.current = fn(latest.current!);
    setAudit(latest.current);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 400);
  }
  const setSig = (who: 'assessor' | 'client', patch: Partial<Signature>) =>
    update((a) => ({ ...a, signatures: { ...a.signatures, [who]: { ...a.signatures[who], ...patch } } }));

  const result = useMemo(() => (audit ? scoreOf(audit) : null), [audit]);
  const prevAudit = candidates.find((c) => c.id === audit?.compareWithId);
  const prev = useMemo(() => (prevAudit ? summarise(prevAudit) : null), [prevAudit]);

  if (!audit || !result) return <TopBar title="Loading…" back="/" />;
  const backToAudit = `/audit/${audit.id}${audit.lastArea ? '/' + audit.lastArea : ''}`;

  async function finish() {
    const a = latest.current!;
    const r = scoreOf(a);
    const warnings: string[] = [];
    if (r.overall.pct === null) warnings.push('Nothing has been rated Met, Partial or Not met, so there is no score.');
    if (r.unrated.length) warnings.push(`${r.unrated.length} criteria not rated. They will be listed as "not assessed".`);
    const noAction = r.gaps.filter((g) => !g.response.action?.trim()).length;
    if (noAction) warnings.push(`${noAction} gap${noAction === 1 ? ' has' : 's have'} no action. ${noAction === 1 ? 'It' : 'They'} will show "To be agreed".`);
    if (!a.signatures.assessor.image) warnings.push('You have not signed.');
    if (!a.signatures.client.image) warnings.push('The client contact has not signed.');
    if (!a.signatures.client.name.trim()) warnings.push('Client contact name is blank.');

    const ok = await confirmDialog({
      title: 'Finish and lock this audit?',
      body: (
        <>
          {warnings.length > 0 && (
            <div class="notice warn"><ul style={{ margin: 0, paddingLeft: 18 }}>{warnings.map((w) => <li>{w}</li>)}</ul></div>
          )}
          <p>Once finished, the audit is <b>locked</b> and moves to Records. You won't be able to change it, so the client report always matches what was issued.</p>
        </>
      ),
      ok: 'Finish audit',
    });
    if (!ok) return;
    clearTimeout(timer.current);
    timer.current = undefined;
    const toLock: Audit = { ...a, previous: prevAudit ? summarise(prevAudit) : null, compareWithId: prevAudit ? prevAudit.id : null };
    try {
      await finishAudit(toLock);
      toast('Audit finished and locked');
      go(`/record/${a.id}`, true);
    } catch (e) {
      toast((e as Error).message);
    }
  }

  return (
    <>
      <TopBar title="Review and finish" sub={auditTitle(audit)} back={async () => { await flush(); go(backToAudit); }} />
      <main class="page">
        <ResultView audit={audit} result={result} prev={prev} onGapClick={async (area) => { await flush(); go(`/audit/${audit.id}/${area}`); }} />

        <h3>Compare with a previous audit</h3>
        {candidates.length === 0 ? (
          <p class="small muted">No finished audit exists for the same client, site, level{audit.setup.level !== 'Site' ? ' and department' : ''}.</p>
        ) : (
          <div class="card" role="radiogroup" aria-label="Previous audit">
            {[...candidates, null].map((c) => {
              const id = c ? c.id : null;
              const on = (audit.compareWithId ?? null) === id;
              return (
                <label class="radio">
                  <input type="radio" name="cmp" checked={on} onChange={() => update((a) => ({ ...a, compareWithId: id }))} />
                  <span>{c ? `${formatDate(c.setup.date)} · ${formatPct(scoreOf(c).overall.pct)}` : 'No comparison'}</span>
                </label>
              );
            })}
          </div>
        )}

        <h3>Sign-off</h3>
        <SigBlock title="Lead assessor" sig={audit.signatures.assessor} onChange={(p) => setSig('assessor', p)} />
        <SigBlock title="Client contact" sig={audit.signatures.client} onChange={(p) => setSig('client', p)} />

        <button class="btn ghost block danger-link" style={{ marginTop: 12 }} onClick={async () => {
          clearTimeout(timer.current); timer.current = undefined;
          if (!(await discardAudit(latest.current!))) await flush();
        }}>
          Discard this audit
        </button>
      </main>
      <div class="bottombar">
        <button class="btn ghost" onClick={async () => { await flush(); go(backToAudit); }}>Back to audit</button>
        <button class="btn primary" onClick={finish}>Finish audit</button>
      </div>
    </>
  );
}

function SigBlock(props: { title: string; sig: Signature; onChange: (p: Partial<Signature>) => void }) {
  const { sig } = props;
  return (
    <div class="card">
      <h3 style={{ marginTop: 0 }}>{props.title}</h3>
      <label class="field"><span>Name</span>
        <input type="text" value={sig.name} onInput={(e) => props.onChange({ name: e.currentTarget.value })} />
      </label>
      <label class="field"><span>Role</span>
        <input type="text" value={sig.role} onInput={(e) => props.onChange({ role: e.currentTarget.value })} />
      </label>
      <SignaturePad
        label={`${props.title} signature`}
        value={sig.image}
        onChange={(image) => props.onChange({ image, signedAt: image ? new Date().toISOString() : undefined })}
      />
    </div>
  );
}
