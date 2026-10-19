export type Rating = 'Met' | 'Partial' | 'Not met' | 'N/A';
export const RATINGS: Rating[] = ['Met', 'Partial', 'Not met', 'N/A'];

export type ScopeTag = 'Site' | 'Department' | 'All levels';
export const SCOPE_TAGS: ScopeTag[] = ['Site', 'Department', 'All levels'];

export type Level = 'Site' | 'Department' | 'Sub-department';
export const LEVELS: Level[] = ['Site', 'Department', 'Sub-department'];

export type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM';

export interface Area {
  code: string;
  name: string;
  why: string;
}

export interface Criterion {
  id: string;
  area: string;
  text: string;
  scope: ScopeTag;
  critical: boolean;
  refs: Record<string, string>;
  /** Switched off in Settings. Missing means on. */
  off?: boolean;
}

export interface Library {
  library: string;
  version: string;
  author?: string;
  scope_rules: Record<Level, ScopeTag[]>;
  areas: Area[];
  criteria: Criterion[];
  coverage_note?: string;
  /** Anything else in the imported file is kept as-is. */
  [key: string]: unknown;
}

/** The criteria an audit was run against, frozen when the audit starts. */
export interface LibrarySnapshot {
  library: string;
  version: string;
  scope_rules: Record<Level, ScopeTag[]>;
  areas: Area[];
  criteria: Criterion[];
  coverage_note?: string;
}

export interface CriterionResponse {
  rating?: Rating;
  notes: string;
  photoIds: string[];
  action: string;
  owner: string;
  due: string;
}

export interface AuditSetup {
  client: string;
  site: string;
  level: Level;
  department: string;
  subDepartment: string;
  assessor: string;
  date: string; // YYYY-MM-DD
  scope: string;
  notes: string;
}

export interface Signature {
  name: string;
  role: string;
  /** PNG data URL, empty when not signed. */
  image: string;
  signedAt?: string;
}

export interface PrevGap {
  id: string;
  text: string;
  rating: Rating;
  priority: Priority;
  action: string;
  owner: string;
  due: string;
}

export interface PreviousSummary {
  auditId: string;
  date: string;
  pct: number | null;
  areaPct: Record<string, number | null>;
  /** The previous audit's gaps and actions, for the follow-up section. */
  gaps?: PrevGap[];
}

export interface Audit {
  id: string;
  status: 'draft' | 'finished';
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
  setup: AuditSetup;
  library: LibrarySnapshot;
  responses: Record<string, CriterionResponse>;
  signatures: { assessor: Signature; client: Signature };
  /** undefined = not chosen yet, null = no comparison. */
  compareWithId?: string | null;
  /** Frozen copy of the previous audit's scores, stored when finished. */
  previous?: PreviousSummary | null;
  /** Last area the user was on, so "continue" returns there. */
  lastArea?: string;
}

export interface PhotoRecord {
  id: string;
  auditId: string;
  criterionId: string;
  blob: Blob;
  width: number;
  height: number;
  createdAt: string;
}

export interface Brand {
  name: string;
  tagline: string;
  monogram: string;
  logo: string; // data URL or ''
  navy: string;
  teal: string;
  amber: string;
}

export const DEFAULT_BRAND: Brand = {
  name: 'Paulo Ferreira',
  tagline: 'Training & Competence Systems',
  monogram: 'PF',
  logo: '',
  navy: '#0B2545',
  teal: '#13838F',
  amber: '#F0A202',
};

export const DEFAULT_ASSESSOR = 'Paulo Ferreira';
