// Follow-up of the previous audit's gaps: has each one been closed?
import type { Audit, PrevGap, PreviousSummary, Rating } from '../types';
import { inScope } from './library';

export type FollowUpStatus = 'Closed' | 'Improved' | 'Open' | 'No longer applicable' | 'Not assessed';

export interface FollowUpRow {
  prev: PrevGap;
  now: Rating | undefined;
  status: FollowUpStatus;
}

export function followUpStatus(prev: Rating, now: Rating | undefined): FollowUpStatus {
  if (!now) return 'Not assessed';
  if (now === 'Met') return 'Closed';
  if (now === 'N/A') return 'No longer applicable';
  if (prev === 'Not met' && now === 'Partial') return 'Improved';
  return 'Open';
}

/** One row per gap from the previous audit, in the previous audit's priority order. */
export function followUpRows(audit: Audit, prev: PreviousSummary | null | undefined): FollowUpRow[] {
  if (!prev?.gaps?.length) return [];
  const scope = new Set(inScope(audit.library, audit.setup.level).map((c) => c.id));
  return prev.gaps.map((g) => {
    const now = scope.has(g.id) ? audit.responses[g.id]?.rating : undefined;
    return { prev: g, now, status: followUpStatus(g.rating, now) };
  });
}

export function followUpCounts(rows: FollowUpRow[]): Record<FollowUpStatus, number> {
  const c: Record<FollowUpStatus, number> = { Closed: 0, Improved: 0, Open: 0, 'No longer applicable': 0, 'Not assessed': 0 };
  for (const r of rows) c[r.status]++;
  return c;
}
