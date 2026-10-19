import { useState } from 'preact/hooks';
import type { Criterion, Library, ScopeTag } from '../types';
import { SCOPE_TAGS } from '../types';
import { KV, setKV } from '../lib/db';
import { nextCriterionId } from '../lib/library';
import { go, Icon, Sheet, toast, TopBar } from './common';
import { useApp } from './app-state';

/** Reword criteria, change scope and critical flags, add criteria, switch criteria off. */
export function LibraryEditor() {
  const { library, reload } = useApp();
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ c: Criterion; isNew: boolean } | null>(null);

  if (!library) { go('/settings', true); return null; }

  async function saveLib(lib: Library) {
    await setKV(KV.library, lib);
    await reload();
  }

  async function saveCriterion(c: Criterion, isNew: boolean) {
    const lib = structuredClone(library!);
    if (isNew) {
      // New criteria go after the last one in their area.
      let idx = -1;
      lib.criteria.forEach((x, i) => { if (x.area === c.area) idx = i; });
      lib.criteria.splice(idx + 1, 0, c);
    } else {
      lib.criteria = lib.criteria.map((x) => (x.id === c.id ? c : x));
    }
    await saveLib(lib);
    setEditing(null);
    toast(isNew ? `${c.id} added` : `${c.id} saved`);
  }

  async function toggleOff(c: Criterion) {
    const lib = structuredClone(library!);
    lib.criteria = lib.criteria.map((x) => {
      if (x.id !== c.id) return x;
      const { off, ...rest } = x;
      return off ? rest : { ...rest, off: true };
    });
    await saveLib(lib);
  }

  return (
    <>
      <TopBar title="Edit criteria" back="/settings" />
      <main class="page">
        <p class="small muted">Changes apply to new audits only. Audits already started or finished keep the criteria they were created with.</p>
        {library.areas.map((a) => {
          const list = library.criteria.filter((c) => c.area === a.code);
          const isOpen = open === a.code;
          return (
            <section class="card" style={{ padding: 0, overflow: 'hidden' }}>
              <button class="listitem" style={{ margin: 0, boxShadow: 'none', borderRadius: 0 }} onClick={() => setOpen(isOpen ? null : a.code)} aria-expanded={isOpen}>
                <b>{a.code}. {a.name}</b>
                <span class="meta">{list.filter((c) => !c.off).length} of {list.length} switched on</span>
              </button>
              {isOpen && (
                <div style={{ padding: '0 16px 16px' }}>
                  {list.map((c) => (
                    <div style={{ borderTop: '1px solid var(--line)', padding: '10px 0', opacity: c.off ? 0.55 : 1 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <b>{c.id}</b>
                        <span class="badge">{c.scope}</span>
                        {c.critical && <span class="badge critical">CRITICAL</span>}
                        {c.off && <span class="badge">OFF</span>}
                      </div>
                      <div class="small" style={{ margin: '4px 0 8px' }}>{c.text}</div>
                      <div class="row">
                        <button class="btn ghost" style={{ minHeight: 44 }} onClick={() => setEditing({ c: structuredClone(c), isNew: false })}><Icon.edit /> Edit</button>
                        <button class="btn ghost" style={{ minHeight: 44 }} onClick={() => toggleOff(c)}>{c.off ? 'Switch on' : 'Switch off'}</button>
                      </div>
                    </div>
                  ))}
                  <button class="btn teal block" style={{ marginTop: 10 }} onClick={() => setEditing({
                    c: { id: nextCriterionId(library, a.code), area: a.code, text: '', scope: 'All levels', critical: false, refs: {} },
                    isNew: true,
                  })}>
                    <Icon.plus /> Add criterion to {a.code}
                  </button>
                </div>
              )}
            </section>
          );
        })}
      </main>
      {editing && <CriterionSheet c={editing.c} isNew={editing.isNew} onCancel={() => setEditing(null)} onSave={(c) => saveCriterion(c, editing.isNew)} />}
    </>
  );
}

function CriterionSheet(props: { c: Criterion; isNew: boolean; onCancel: () => void; onSave: (c: Criterion) => void }) {
  const [c, setC] = useState<Criterion>(props.c);
  const valid = c.text.trim().length > 0;
  return (
    <Sheet onClose={props.onCancel} label={`Edit ${c.id}`}>
      <h2>{props.isNew ? 'New criterion' : 'Edit criterion'} {c.id}</h2>
      <label class="field"><span>Wording</span>
        <textarea value={c.text} onInput={(e) => setC({ ...c, text: e.currentTarget.value })} />
      </label>
      <div class="field">
        <span>Scope</span>
        <div class="seg">
          {SCOPE_TAGS.map((t: ScopeTag) => (
            <button type="button" class={c.scope === t ? 'on' : ''} onClick={() => setC({ ...c, scope: t })}>{t}</button>
          ))}
        </div>
      </div>
      <label class="toggle">
        <span><b>Critical criterion</b><br /><span class="small muted">Gaps get a higher priority</span></span>
        <input type="checkbox" checked={c.critical} onChange={(e) => setC({ ...c, critical: e.currentTarget.checked })} />
      </label>
      <div class="row">
        <button class="btn ghost" onClick={props.onCancel}>Cancel</button>
        <button class="btn primary" disabled={!valid} onClick={() => props.onSave({ ...c, text: c.text.trim() })}>Save</button>
      </div>
    </Sheet>
  );
}
