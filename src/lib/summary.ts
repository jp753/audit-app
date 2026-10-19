// Plain-English wording shared by the screens and the PDF report.
import type { PreviousSummary, Rating } from '../types';
import type { AuditResult } from './scoring';
import { formatDate } from './audit';

export const NOT_ASSESSED = 'Not assessed';
export const TO_BE_AGREED = 'To be agreed';

export function ratingWord(r: Rating | undefined): string {
  if (!r) return 'not assessed';
  return r === 'N/A' ? 'N/A' : r.toLowerCase();
}

export interface CriticalLine {
  ok: boolean;
  text: string;
}

/** e.g. "No critical gaps. Critical criteria at this level: E1 met." */
export function criticalLine(r: AuditResult): CriticalLine {
  if (r.critical.length === 0) return { ok: true, text: 'No critical criteria apply at this level.' };
  const list = r.critical.map((c) => `${c.criterion.id} ${ratingWord(c.rating)}`).join(', ');
  const gaps = r.critical.filter((c) => c.rating === 'Not met' || c.rating === 'Partial').length;
  const unrated = r.critical.filter((c) => !c.rating).length;
  if (gaps === 0) {
    const extra = unrated ? ` (${unrated} not assessed)` : '';
    return { ok: unrated === 0, text: `No critical gaps${extra}. Critical criteria at this level: ${list}.` };
  }
  return {
    ok: false,
    text: `${gaps} critical criteri${gaps === 1 ? 'on has a gap' : 'a have gaps'}. Critical criteria at this level: ${list}.`,
  };
}

/** Three-line summary for the report. */
export function summaryLines(r: AuditResult, prev?: PreviousSummary | null): string[] {
  const o = r.overall;
  let l1 = o.pct === null
    ? 'No score: no criteria were rated Met, Partial or Not met.'
    : `Overall score ${o.pct}%, maturity level ${o.maturity!.level} – ${o.maturity!.name}.`;
  if (prev && prev.pct !== null && o.pct !== null) {
    const d = o.pct - prev.pct;
    const move = d > 0 ? `up ${d} points from` : d < 0 ? `down ${-d} points from` : 'unchanged from';
    l1 = l1.replace(/\.$/, `, ${move} ${prev.pct}% at the previous audit (${formatDate(prev.date)}).`);
  }
  const c = o.counts;
  let l2 = `${c.rated} of ${c.inScope} in-scope criteria rated: ${c.met} Met, ${c.partial} Partial, ${c.notMet} Not met, ${c.na} N/A.`;
  if (c.unrated) l2 += ` ${c.unrated} not assessed.`;
  const g = r.gapCounts;
  const total = r.gaps.length;
  const l3 = total === 0
    ? 'No gaps found.'
    : `${total} gap${total === 1 ? '' : 's'}: ${g.CRITICAL} CRITICAL, ${g.HIGH} HIGH, ${g.MEDIUM} MEDIUM.`;
  return [l1, l2, l3];
}
