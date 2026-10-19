import type { Audit, AuditSetup, CriterionResponse, Library, Level } from '../types';
import { DEFAULT_ASSESSOR } from '../types';
import { snapshotLibrary } from './library';
import { newId } from './db';

export function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function blankSetup(): AuditSetup {
  return {
    client: '',
    site: '',
    level: 'Site',
    department: '',
    subDepartment: '',
    assessor: DEFAULT_ASSESSOR,
    date: todayISO(),
    scope: '',
    notes: '',
  };
}

export function newAudit(lib: Library, setup: AuditSetup = blankSetup()): Audit {
  const now = new Date().toISOString();
  return {
    id: newId(),
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    setup,
    library: snapshotLibrary(lib),
    responses: {},
    signatures: {
      assessor: { name: setup.assessor || DEFAULT_ASSESSOR, role: 'Lead assessor', image: '' },
      client: { name: '', role: '', image: '' },
    },
  };
}

/** Re-audit: client details only. Never ratings, notes, photos or actions. */
export function reauditFrom(prev: Audit, lib: Library): Audit {
  const s = prev.setup;
  const a = newAudit(lib, {
    ...blankSetup(),
    client: s.client,
    site: s.site,
    level: s.level,
    department: s.department,
    subDepartment: s.subDepartment,
    scope: s.scope,
  });
  a.compareWithId = prev.id;
  return a;
}

export function emptyResponse(): CriterionResponse {
  return { notes: '', photoIds: [], action: '', owner: '', due: '' };
}

/** Department/Sub-department values, cleared when the level doesn't use them. */
export function normaliseSetup(s: AuditSetup): AuditSetup {
  const out = { ...s };
  if (s.level === 'Site') { out.department = ''; out.subDepartment = ''; }
  if (s.level === 'Department') out.subDepartment = '';
  return out;
}

export function showsDepartment(level: Level) {
  return level !== 'Site';
}
export function showsSubDepartment(level: Level) {
  return level === 'Sub-department';
}

/** Same client, site, level, department and sub-department (ignoring case/spaces). */
export function sameScope(a: AuditSetup, b: AuditSetup): boolean {
  const n = (x: string) => x.trim().toLowerCase().replace(/\s+/g, ' ');
  const na = normaliseSetup(a);
  const nb = normaliseSetup(b);
  return (
    n(na.client) === n(nb.client) &&
    n(na.site) === n(nb.site) &&
    na.level === nb.level &&
    n(na.department) === n(nb.department) &&
    n(na.subDepartment) === n(nb.subDepartment)
  );
}

export function auditTitle(a: Audit): string {
  const s = a.setup;
  const parts = [s.client || 'Untitled client', s.site];
  if (s.level !== 'Site' && s.department) parts.push(s.department);
  if (s.level === 'Sub-department' && s.subDepartment) parts.push(s.subDepartment);
  return parts.filter(Boolean).join(' · ');
}

export function formatDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[m - 1]} ${y}`;
}
