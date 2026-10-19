import type { Audit, PreviousSummary } from '../types';
import { sameScope } from './audit';
import { scoreOf } from './scoring';

/** Finished audits for the same client, site, level, department and sub-department. Newest first. */
export function comparisonCandidates(audit: Audit, all: Audit[]): Audit[] {
  return all
    .filter((a) => a.id !== audit.id && a.status === 'finished' && sameScope(a.setup, audit.setup))
    .sort((a, b) => b.setup.date.localeCompare(a.setup.date) || (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''));
}

/** Frozen copy of a previous audit's scores, kept inside the new audit when it is finished. */
export function summarise(prev: Audit): PreviousSummary {
  const r = scoreOf(prev);
  const areaPct: Record<string, number | null> = {};
  for (const a of r.areas) areaPct[a.code] = a.hasScope ? a.result.pct : null;
  const gaps = r.gaps.map((g) => ({
    id: g.criterion.id,
    text: g.criterion.text,
    rating: g.rating,
    priority: g.priority,
    action: g.response.action?.trim() ?? '',
    owner: g.response.owner?.trim() ?? '',
    due: g.response.due ?? '',
  }));
  return { auditId: prev.id, date: prev.setup.date, pct: r.overall.pct, areaPct, gaps };
}

export function changeText(now: number | null, before: number | null | undefined): string {
  if (now === null || before === null || before === undefined) return '–';
  const d = now - before;
  return d > 0 ? `+${d}` : d < 0 ? `−${Math.abs(d)}` : '0';
}
