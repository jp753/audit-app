import { useEffect, useState } from 'preact/hooks';
import type { Audit, AuditSetup, Level } from '../types';
import { LEVELS } from '../types';
import { blankSetup, newAudit, normaliseSetup, showsDepartment, showsSubDepartment } from '../lib/audit';
import { getAudit, saveAudit } from '../lib/db';
import { inScope } from '../lib/library';
import { go, TopBar } from './common';
import { useApp } from './app-state';
import { discardAudit } from './discard';

/** Set-up form, used for a new audit (no id) or to edit a draft's details. */
export function Setup(props: { id?: string }) {
  const { library } = useApp();
  const [audit, setAudit] = useState<Audit | null>(null);
  const [s, setS] = useState<AuditSetup>(blankSetup());
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!props.id) return;
    getAudit(props.id).then((a) => {
      if (!a) return go('/', true);
      if (a.status === 'finished') return go(`/record/${a.id}`, true);
      setAudit(a);
      setS(a.setup);
    });
  }, [props.id]);

  const set = <K extends keyof AuditSetup>(k: K, v: AuditSetup[K]) => setS((o) => ({ ...o, [k]: v }));
  const lib = audit?.library ?? library!;
  const count = lib ? inScope(lib, s.level).length : 0;

  const missing: string[] = [];
  if (!s.client.trim()) missing.push('client');
  if (!s.site.trim()) missing.push('site');
  if (showsDepartment(s.level) && !s.department.trim()) missing.push('department');
  if (showsSubDepartment(s.level) && !s.subDepartment.trim()) missing.push('sub-department');
  if (!s.date) missing.push('audit date');

  async function save() {
    setTried(true);
    if (missing.length) return;
    const setup = normaliseSetup({ ...s, client: s.client.trim(), site: s.site.trim() });
    if (audit) {
      const updated = { ...audit, setup };
      await saveAudit(updated);
      go(`/audit/${audit.id}`);
    } else {
      const a = newAudit(library!, setup);
      a.signatures.assessor.name = setup.assessor;
      await saveAudit(a);
      go(`/audit/${a.id}`, true);
    }
  }

  const err = (k: string) => tried && missing.includes(k);

  return (
    <>
      <TopBar title={audit ? 'Audit details' : 'New audit'} back={audit ? `/audit/${audit.id}` : '/'} />
      <main class="page">
        <Field label="Client / organisation" error={err('client')}>
          <input type="text" value={s.client} onInput={(e) => set('client', e.currentTarget.value)} autocomplete="organization" />
        </Field>
        <Field label="Site" error={err('site')}>
          <input type="text" value={s.site} onInput={(e) => set('site', e.currentTarget.value)} />
        </Field>
        <div class="field">
          <span>Audit level</span>
          <div class="seg" role="radiogroup" aria-label="Audit level">
            {LEVELS.map((l: Level) => (
              <button type="button" role="radio" aria-checked={s.level === l} class={s.level === l ? 'on' : ''} onClick={() => set('level', l)}>
                {l}
              </button>
            ))}
          </div>
          <small>{count} criteria will be audited at this level.</small>
        </div>
        {showsDepartment(s.level) && (
          <Field label="Department" error={err('department')}>
            <input type="text" value={s.department} onInput={(e) => set('department', e.currentTarget.value)} />
          </Field>
        )}
        {showsSubDepartment(s.level) && (
          <Field label="Sub-department" error={err('sub-department')}>
            <input type="text" value={s.subDepartment} onInput={(e) => set('subDepartment', e.currentTarget.value)} />
          </Field>
        )}
        <Field label="Lead assessor">
          <input type="text" value={s.assessor} onInput={(e) => set('assessor', e.currentTarget.value)} />
        </Field>
        <Field label="Audit date" error={err('audit date')}>
          <input type="date" value={s.date} onInput={(e) => set('date', e.currentTarget.value)} />
        </Field>
        <Field label="Scope statement">
          <textarea value={s.scope} onInput={(e) => set('scope', e.currentTarget.value)} placeholder="What this audit covers" />
        </Field>
        <Field label="Notes">
          <textarea value={s.notes} onInput={(e) => set('notes', e.currentTarget.value)} />
        </Field>
        {audit && audit.setup.level !== s.level && (
          <div class="notice warn">Changing the level changes which criteria count. Ratings you've already made are kept.</div>
        )}
        {tried && missing.length > 0 && <div class="notice bad">Please fill in: {missing.join(', ')}.</div>}
        {audit && (
          <button class="btn ghost block danger-link" style={{ marginTop: 24 }} onClick={() => discardAudit(audit)}>
            Discard this audit
          </button>
        )}
      </main>
      <div class="bottombar">
        <button class="btn primary" onClick={save}>{audit ? 'Save details' : 'Start audit'}</button>
      </div>
    </>
  );
}

function Field(props: { label: string; error?: boolean; children: any }) {
  return (
    <label class="field">
      <span style={props.error ? { color: 'var(--notmet)' } : undefined}>
        {props.label}{props.error ? ' (required)' : ''}
      </span>
      {props.children}
    </label>
  );
}
