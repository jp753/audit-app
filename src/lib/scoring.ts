// Scoring rules agreed with Paulo. Do not change without asking him.
//  - Met = 1, Partial = 0.5, Not met = 0. N/A and unrated are left out.
//  - Score = points / number of in-scope criteria rated Met, Partial or Not met.
//  - Scores show as whole percentages. The maturity band is set from that
//    rounded whole number, so the band always matches the number shown.
import type { Audit, Criterion, Level, LibrarySnapshot, Priority, Rating, CriterionResponse } from '../types';
import { inScope } from './library';

export const POINTS: Record<Exclude<Rating, 'N/A'>, number> = { Met: 1, Partial: 0.5, 'Not met': 0 };

export interface Maturity {
  level: 1 | 2 | 3 | 4 | 5;
  name: string;
}

export const MATURITY_BANDS: { min: number; level: Maturity['level']; name: string; label: string }[] = [
  { min: 95, level: 5, name: 'Best practice', label: '95% and over' },
  { min: 80, level: 4, name: 'Managed', label: '80–94%' },
  { min: 60, level: 3, name: 'Established', label: '60–79%' },
  { min: 40, level: 2, name: 'Developing', label: '40–59%' },
  { min: 0, level: 1, name: 'Reactive', label: 'under 40%' },
];

/** Whole-percentage display value. Rounds halves up (56.5 → 57). */
export function toPct(score: number): number {
  // toFixed guards against floating-point noise like 0.565 * 100 = 56.49999…
  return Math.round(Number((score * 100).toFixed(6)));
}

/** Maturity from the displayed (rounded) whole percentage. */
export function maturityFor(pct: number): Maturity {
  const band = MATURITY_BANDS.find((b) => pct >= b.min)!;
  return { level: band.level, name: band.name };
}

export function priorityFor(rating: Rating | undefined, critical: boolean): Priority | null {
  if (rating === 'Not met') return critical ? 'CRITICAL' : 'HIGH';
  if (rating === 'Partial') return critical ? 'HIGH' : 'MEDIUM';
  return null;
}

const PRIORITY_ORDER: Record<Priority, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };

export interface Counts {
  inScope: number;
  rated: number; // anything with a rating, including N/A
  met: number;
  partial: number;
  notMet: number;
  na: number;
  unrated: number;
}

export interface ScoreResult {
  points: number;
  scored: number; // rated Met, Partial or Not met
  /** Full-precision score 0–1, or null when nothing is scored. */
  score: number | null;
  /** Whole percentage, or null when nothing is scored. */
  pct: number | null;
  maturity: Maturity | null;
  counts: Counts;
}

export function scoreCriteria(criteria: Criterion[], responses: Record<string, Partial<CriterionResponse>>): ScoreResult {
  const counts: Counts = { inScope: criteria.length, rated: 0, met: 0, partial: 0, notMet: 0, na: 0, unrated: 0 };
  let points = 0;
  for (const c of criteria) {
    const r = responses[c.id]?.rating;
    if (!r) { counts.unrated++; continue; }
    counts.rated++;
    if (r === 'N/A') { counts.na++; continue; }
    if (r === 'Met') counts.met++;
    else if (r === 'Partial') counts.partial++;
    else if (r === 'Not met') counts.notMet++;
    points += POINTS[r];
  }
  const scored = counts.met + counts.partial + counts.notMet;
  const score = scored > 0 ? points / scored : null;
  const pct = score === null ? null : toPct(score);
  return { points, scored, score, pct, maturity: pct === null ? null : maturityFor(pct), counts };
}

export interface Gap {
  criterion: Criterion;
  rating: Rating;
  priority: Priority;
  response: Partial<CriterionResponse>;
}

/** Partial and Not met criteria: CRITICAL, then HIGH, then MEDIUM; library order within each. */
export function gapsFor(criteria: Criterion[], responses: Record<string, Partial<CriterionResponse>>): Gap[] {
  const gaps: (Gap & { idx: number })[] = [];
  criteria.forEach((c, idx) => {
    const resp = responses[c.id] ?? {};
    const p = priorityFor(resp.rating, c.critical);
    if (p) gaps.push({ criterion: c, rating: resp.rating!, priority: p, response: resp, idx });
  });
  gaps.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.idx - b.idx);
  return gaps.map(({ idx, ...g }) => g);
}

export interface AreaResult {
  code: string;
  name: string;
  why: string;
  criteria: Criterion[];
  result: ScoreResult;
  /** False when the area has nothing in scope at this level ("not scored"). */
  hasScope: boolean;
}

export interface AuditResult {
  level: Level;
  criteria: Criterion[];
  overall: ScoreResult;
  areas: AreaResult[];
  gaps: Gap[];
  gapCounts: Record<Priority, number>;
  unrated: Criterion[];
  strengths: Criterion[];
  critical: { criterion: Criterion; rating: Rating | undefined }[];
}

export function scoreAudit(
  lib: Pick<LibrarySnapshot, 'criteria' | 'scope_rules' | 'areas'>,
  level: Level,
  responses: Record<string, Partial<CriterionResponse>>,
): AuditResult {
  const criteria = inScope(lib, level);
  const overall = scoreCriteria(criteria, responses);
  const areas: AreaResult[] = lib.areas.map((a) => {
    const ac = criteria.filter((c) => c.area === a.code);
    return { code: a.code, name: a.name, why: a.why, criteria: ac, result: scoreCriteria(ac, responses), hasScope: ac.length > 0 };
  });
  const gaps = gapsFor(criteria, responses);
  const gapCounts: Record<Priority, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0 };
  for (const g of gaps) gapCounts[g.priority]++;
  return {
    level,
    criteria,
    overall,
    areas,
    gaps,
    gapCounts,
    unrated: criteria.filter((c) => !responses[c.id]?.rating),
    strengths: criteria.filter((c) => responses[c.id]?.rating === 'Met'),
    critical: criteria.filter((c) => c.critical).map((c) => ({ criterion: c, rating: responses[c.id]?.rating })),
  };
}

export function scoreOf(audit: Audit): AuditResult {
  return scoreAudit(audit.library, audit.setup.level, audit.responses);
}

export function formatPct(pct: number | null): string {
  return pct === null ? 'Not scored' : `${pct}%`;
}
