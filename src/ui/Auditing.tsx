import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Audit, Criterion, CriterionResponse, PrevGap, Rating } from '../types';
import { RATINGS } from '../types';
import { auditTitle, emptyResponse, formatDate } from '../lib/audit';
import { summarise } from '../lib/compare';
import { deletePhoto, getAudit, getPhoto, newId, saveAudit, savePhoto } from '../lib/db';
import { compressImage } from '../lib/images';
import { priorityFor, scoreOf } from '../lib/scoring';
import { confirmDialog, go, Icon, Sheet, toast, TopBar } from './common';

const cls = (r?: Rating) => (r ? r.replace(/[^A-Za-z]/g, '') : '');

export function Auditing(props: { id: string; area?: string }) {
  const [audit, setAudit] = useState<Audit | null>(null);
  const latest = useRef<Audit | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  // On a re-audit, last time's gaps and actions are shown on each card.
  const [prevGaps, setPrevGaps] = useState<{ date: string; byId: Map<string, PrevGap> } | null>(null);

  useEffect(() => {
    getAudit(props.id).then((a) => {
      if (!a) return go('/', true);
      if (a.status === 'finished') return go(`/record/${a.id}`, true);
      latest.current = a;
      setAudit(a);
      if (a.compareWithId) {
        getAudit(a.compareWithId).then((p) => {
          if (p && p.status === 'finished') {
            const sum = summarise(p);
            setPrevGaps({ date: sum.date, byId: new Map((sum.gaps ?? []).map((g) => [g.id, g])) });
          }
        });
      }
    });
  }, [props.id]);

  // ---------- autosave ----------
  async function flush() {
    clearTimeout(timer.current);
    timer.current = undefined;
    const a = latest.current;
    if (!a) return;
    try {
      await saveAudit(a);
      setSaveState('saved');
    } catch (e) {
      setSaveState('error');
      toast('Could not save: ' + (e as Error).message);
    }
  }
  function schedule(delay: number) {
    setSaveState('saving');
    clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, delay);
  }
  useEffect(() => {
    const onHide = () => { if (timer.current !== undefined) flush(); };
    const onVis = () => { if (document.visibilityState === 'hidden') onHide(); };
    addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVis);
      onHide();
    };
  }, []);

  function update(fn: (a: Audit) => Audit, delay = 400) {
    const next = fn(latest.current!);
    latest.current = next;
    setAudit(next);
    schedule(delay);
  }
  function updateResponse(cid: string, patch: Partial<CriterionResponse>, delay = 400) {
    update((a) => ({
      ...a,
      responses: { ...a.responses, [cid]: { ...emptyResponse(), ...a.responses[cid], ...patch } },
    }), delay);
  }

  const result = useMemo(() => (audit ? scoreOf(audit) : null), [audit]);
  const areas = result ? result.areas.filter((a) => a.hasScope) : [];
  const areaIdx = Math.max(0, areas.findIndex((a) => a.code === props.area));
  const area = areas[areaIdx];

  // Remember where we were, so "Continue" comes back here.
  useEffect(() => {
    if (audit && area && audit.lastArea !== area.code) update((a) => ({ ...a, lastArea: area.code }), 50);
  }, [area?.code, !!audit]);

  if (!audit || !result) return <TopBar title="Loading…" back="/" />;
  if (!area) {
    return (
      <>
        <TopBar title={auditTitle(audit)} back="/" />
        <main class="page"><p class="empty">No criteria are in scope at this level.</p></main>
      </>
    );
  }

  const { counts } = result.overall;
  const pctDone = counts.inScope ? (counts.rated / counts.inScope) * 100 : 0;
  const toArea = (code: string) => go(`/audit/${audit.id}/${code}`, true);
  const isLast = areaIdx === areas.length - 1;

  return (
    <>
      <TopBar
        title={auditTitle(audit)}
        sub={`${audit.setup.level} audit`}
        back={async () => { await flush(); go('/'); }}
        right={<button class="iconbtn" aria-label="Edit audit details" onClick={async () => { await flush(); go(`/setup/${audit.id}`); }}><Icon.edit /></button>}
      />
      <div class="progress">
        <div class="label">
          <span>{counts.rated} of {counts.inScope} rated</span>
          <span class="muted" style={{ fontWeight: 'normal' }}>
            {saveState === 'saved' ? '✓ Saved' : saveState === 'saving' ? 'Saving…' : '⚠ Not saved'}
          </span>
        </div>
        <div class="bar" role="progressbar" aria-valuemin={0} aria-valuemax={counts.inScope} aria-valuenow={counts.rated}>
          <div style={{ width: `${pctDone}%` }} />
        </div>
        <nav class="chips" aria-label="Areas">
          {areas.map((a) => (
            <button
              class={`chip ${a.code === area.code ? 'on' : ''} ${a.result.counts.unrated === 0 ? 'done' : ''}`}
              onClick={() => toArea(a.code)}
              aria-label={`Area ${a.code}: ${a.name}, ${a.result.counts.rated} of ${a.result.counts.inScope} rated`}
              aria-current={a.code === area.code}
            >
              {a.code}
            </button>
          ))}
        </nav>
      </div>
      <main class="page">
        <section class="areahead">
          <h2>{area.code}. {area.name}</h2>
          {area.why && <div class="why">{area.why}</div>}
          <div class="small" style={{ marginTop: 8, opacity: .85 }}>{area.result.counts.rated} of {area.result.counts.inScope} rated in this area</div>
        </section>
        {area.criteria.map((c) => (
          <CriterionCard
            key={c.id}
            auditId={audit.id}
            c={c}
            r={audit.responses[c.id] ?? emptyResponse()}
            prev={prevGaps?.byId.get(c.id)}
            prevDate={prevGaps?.date}
            onChange={(patch, delay) => updateResponse(c.id, patch, delay)}
          />
        ))}
      </main>
      <div class="bottombar">
        <button class="btn ghost" disabled={areaIdx === 0} onClick={() => toArea(areas[areaIdx - 1].code)}>
          <Icon.back /> {areaIdx > 0 ? areas[areaIdx - 1].code : 'Prev'}
        </button>
        {isLast ? (
          <button class="btn primary" onClick={async () => { await flush(); go(`/review/${audit.id}`); }}>
            Review <Icon.next />
          </button>
        ) : (
          <button class="btn primary" onClick={() => toArea(areas[areaIdx + 1].code)}>
            Next: {areas[areaIdx + 1].code} <Icon.next />
          </button>
        )}
      </div>
    </>
  );
}

function CriterionCard(props: {
  auditId: string;
  c: Criterion;
  r: CriterionResponse;
  prev?: PrevGap;
  prevDate?: string;
  onChange: (patch: Partial<CriterionResponse>, delay?: number) => void;
}) {
  const { c, r, onChange } = props;
  const priority = priorityFor(r.rating, c.critical);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);

  async function addPhotos(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) return;
    setBusy(true);
    const ids: string[] = [];
    try {
      for (const f of files) {
        const { blob, width, height } = await compressImage(f);
        const id = newId();
        await savePhoto({ id, auditId: props.auditId, criterionId: c.id, blob, width, height, createdAt: new Date().toISOString() });
        ids.push(id);
      }
    } catch (err) {
      toast('Photo could not be added: ' + (err as Error).message);
    } finally {
      setBusy(false);
      if (ids.length) onChange({ photoIds: [...r.photoIds, ...ids] }, 0);
    }
  }

  async function removePhoto(id: string) {
    const ok = await confirmDialog({ title: 'Delete this photo?', ok: 'Delete', danger: true });
    if (!ok) return;
    setViewing(null);
    onChange({ photoIds: r.photoIds.filter((p) => p !== id) }, 0);
    await deletePhoto(id);
  }

  const refs = Object.entries(c.refs ?? {}).filter(([, v]) => v && v !== '—');

  return (
    <article class={`crit r-${cls(r.rating)}`} aria-labelledby={`c-${c.id}`}>
      <div class="top">
        <span class="cid" id={`c-${c.id}`}>{c.id}</span>
        {c.critical && <span class="badge critical">CRITICAL</span>}
        <span class="badge">{c.scope}</span>
        {priority && <span class={`badge p-${priority}`}>{priority} priority</span>}
      </div>
      <p class="text">{c.text}</p>
      {props.prev && (
        <div class="prevbox">
          <b>Last audit ({formatDate(props.prevDate ?? '')}): {props.prev.rating}</b>
          <div>Action: {props.prev.action || 'To be agreed'}{props.prev.owner ? ` · Owner: ${props.prev.owner}` : ''}{props.prev.due ? ` · Due: ${formatDate(props.prev.due)}` : ''}</div>
        </div>
      )}
      <div class="ratings" role="radiogroup" aria-label={`Rating for ${c.id}`}>
        {RATINGS.map((rt) => (
          <button
            type="button"
            role="radio"
            aria-checked={r.rating === rt}
            class={`${cls(rt)} ${r.rating === rt ? 'on' : ''}`}
            // Tap the chosen rating again to clear it.
            onClick={() => onChange({ rating: r.rating === rt ? undefined : rt }, 0)}
          >
            {rt}
          </button>
        ))}
      </div>

      {priority && (
        <div class="actionbox">
          <h4>Action needed</h4>
          <label class="field">
            <span>Action</span>
            <textarea value={r.action} onInput={(e) => onChange({ action: e.currentTarget.value })} placeholder="What needs to happen" />
          </label>
          <label class="field">
            <span>Owner</span>
            <input type="text" value={r.owner} onInput={(e) => onChange({ owner: e.currentTarget.value })} />
          </label>
          <label class="field">
            <span>Due date</span>
            <input type="date" value={r.due} onInput={(e) => onChange({ due: e.currentTarget.value })} />
          </label>
        </div>
      )}

      <label class="field">
        <span>Evidence notes</span>
        <textarea value={r.notes} onInput={(e) => onChange({ notes: e.currentTarget.value })} />
      </label>

      {r.photoIds.length > 0 && (
        <div class="photos">
          {r.photoIds.map((id) => <PhotoThumb id={id} onOpen={() => setViewing(id)} />)}
        </div>
      )}
      <div class="photobtns">
        <label>
          <span class="btn ghost"><Icon.camera /> {busy ? 'Adding…' : 'Camera'}</span>
          <input class="visually-hidden" type="file" accept="image/*" capture="environment" onChange={addPhotos} disabled={busy} />
        </label>
        <label>
          <span class="btn ghost"><Icon.image /> Gallery</span>
          <input class="visually-hidden" type="file" accept="image/*" multiple onChange={addPhotos} disabled={busy} />
        </label>
      </div>

      {refs.length > 0 && (
        <details class="refs">
          <summary>Standards references</summary>
          <table><tbody>{refs.map(([k, v]) => <tr><td>{k}</td><td>{v}</td></tr>)}</tbody></table>
        </details>
      )}

      {viewing && <PhotoViewer id={viewing} label={c.id} onClose={() => setViewing(null)} onDelete={() => removePhoto(viewing)} />}
    </article>
  );
}

function usePhotoUrl(id: string) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let u = '';
    getPhoto(id).then((p) => { if (p) { u = URL.createObjectURL(p.blob); setUrl(u); } });
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [id]);
  return url;
}

function PhotoThumb(props: { id: string; onOpen: () => void }) {
  const url = usePhotoUrl(props.id);
  return (
    <button class="thumb" onClick={props.onOpen} aria-label="View photo">
      {url && <img src={url} alt="" />}
    </button>
  );
}

function PhotoViewer(props: { id: string; label: string; onClose: () => void; onDelete: () => void }) {
  const url = usePhotoUrl(props.id);
  return (
    <Sheet onClose={props.onClose} label="Photo">
      <h2>Photo · {props.label}</h2>
      <div class="viewer">{url && <img src={url} alt={`Evidence photo for ${props.label}`} />}</div>
      <div class="row">
        <button class="btn danger" onClick={props.onDelete}><Icon.trash /> Delete</button>
        <button class="btn primary" onClick={props.onClose}>Close</button>
      </div>
    </Sheet>
  );
}
