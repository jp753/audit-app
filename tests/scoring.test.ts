import { describe, expect, it } from 'vitest';
import sample from './fixtures/sample_library.json';
import type { Criterion, CriterionResponse, Rating } from '../src/types';
import { parseLibrary } from '../src/lib/library';
import { gapsFor, maturityFor, priorityFor, scoreAudit, scoreCriteria, toPct } from '../src/lib/scoring';

const lib = parseLibrary(structuredClone(sample));
const resp = (rating?: Rating): Partial<CriterionResponse> => ({ rating, notes: '', photoIds: [], action: '', owner: '', due: '' });

/** Make n made-up criteria in one area, for counting tests. */
function makeCriteria(n: number, critical: string[] = []): Criterion[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `T${i + 1}`, area: 'T', text: `Dummy ${i + 1}`, scope: 'All levels' as const, critical: critical.includes(`T${i + 1}`), refs: {},
  }));
}

describe('scoring rules', () => {
  it('spec test case: 22 in scope, 11 Met, 3 Partial, 8 Not met -> 57%, level 2 Developing, 11 gaps', () => {
    const crit = makeCriteria(22);
    const r: Record<string, Partial<CriterionResponse>> = {};
    crit.forEach((c, i) => { r[c.id] = resp(i < 11 ? 'Met' : i < 14 ? 'Partial' : 'Not met'); });
    const s = scoreCriteria(crit, r);
    expect(s.points).toBe(12.5);
    expect(s.scored).toBe(22);
    expect(s.score).toBeCloseTo(12.5 / 22, 10);
    expect(s.pct).toBe(57);
    expect(s.maturity).toEqual({ level: 2, name: 'Developing' });
    expect(gapsFor(crit, r)).toHaveLength(11);
  });

  it('points: Met 1, Partial 0.5, Not met 0', () => {
    const crit = makeCriteria(3);
    const s = scoreCriteria(crit, { T1: resp('Met'), T2: resp('Partial'), T3: resp('Not met') });
    expect(s.points).toBe(1.5);
    expect(s.pct).toBe(50);
  });

  it('N/A is left out of the score', () => {
    const crit = makeCriteria(4);
    const s = scoreCriteria(crit, { T1: resp('Met'), T2: resp('N/A'), T3: resp('N/A'), T4: resp('Partial') });
    expect(s.scored).toBe(2);
    expect(s.pct).toBe(75);
    expect(s.counts).toMatchObject({ na: 2, rated: 4, unrated: 0 });
  });

  it('unrated criteria are left out of the score but counted as not assessed', () => {
    const crit = makeCriteria(5);
    const s = scoreCriteria(crit, { T1: resp('Met'), T2: resp('Not met') });
    expect(s.scored).toBe(2);
    expect(s.pct).toBe(50);
    expect(s.counts.unrated).toBe(3);
  });

  it('nothing scored (all N/A or unrated) gives no score and no maturity', () => {
    const crit = makeCriteria(2);
    const s = scoreCriteria(crit, { T1: resp('N/A') });
    expect(s.score).toBeNull();
    expect(s.pct).toBeNull();
    expect(s.maturity).toBeNull();
  });

  it('rounds to whole percentages, halves up, using full precision underneath', () => {
    expect(toPct(0.565)).toBe(57);
    expect(toPct(0.5649)).toBe(56);
    expect(toPct(2 / 3)).toBe(67);
    expect(toPct(1)).toBe(100);
    expect(toPct(0)).toBe(0);
  });

  it('maturity band comes from the rounded number shown (agreed with Paulo)', () => {
    expect(maturityFor(39)).toEqual({ level: 1, name: 'Reactive' });
    expect(maturityFor(40)).toEqual({ level: 2, name: 'Developing' });
    expect(maturityFor(59)).toEqual({ level: 2, name: 'Developing' });
    expect(maturityFor(60)).toEqual({ level: 3, name: 'Established' });
    expect(maturityFor(79)).toEqual({ level: 3, name: 'Established' });
    expect(maturityFor(80)).toEqual({ level: 4, name: 'Managed' });
    expect(maturityFor(94)).toEqual({ level: 4, name: 'Managed' });
    expect(maturityFor(95)).toEqual({ level: 5, name: 'Best practice' });
    expect(maturityFor(100)).toEqual({ level: 5, name: 'Best practice' });
    // 39.6% true score shows as 40% and is therefore Developing.
    const crit = makeCriteria(53); // 21/53 = 39.62%
    const r: Record<string, Partial<CriterionResponse>> = {};
    crit.forEach((c, i) => { r[c.id] = resp(i < 21 ? 'Met' : 'Not met'); });
    const s = scoreCriteria(crit, r);
    expect(s.score!).toBeLessThan(0.4);
    expect(s.pct).toBe(40);
    expect(s.maturity!.name).toBe('Developing');
  });

  it('priority: Not met HIGH (CRITICAL if critical), Partial MEDIUM (HIGH if critical), none for Met and N/A', () => {
    expect(priorityFor('Not met', false)).toBe('HIGH');
    expect(priorityFor('Not met', true)).toBe('CRITICAL');
    expect(priorityFor('Partial', false)).toBe('MEDIUM');
    expect(priorityFor('Partial', true)).toBe('HIGH');
    expect(priorityFor('Met', true)).toBeNull();
    expect(priorityFor('N/A', true)).toBeNull();
    expect(priorityFor(undefined, true)).toBeNull();
  });

  it('gaps are ordered CRITICAL, HIGH, MEDIUM, then criterion order', () => {
    const crit = makeCriteria(6, ['T5', 'T6']);
    const r = { T1: resp('Partial'), T2: resp('Not met'), T3: resp('Partial'), T4: resp('Not met'), T5: resp('Partial'), T6: resp('Not met') };
    const g = gapsFor(crit, r);
    expect(g.map((x) => `${x.criterion.id}:${x.priority}`)).toEqual([
      'T6:CRITICAL', 'T2:HIGH', 'T4:HIGH', 'T5:HIGH', 'T1:MEDIUM', 'T3:MEDIUM',
    ]);
  });
});

describe('scoring at each level (sample library)', () => {
  const all = { P1: resp('Met'), P2: resp('Partial'), P3: resp('Not met'), Q1: resp('Partial'), Q2: resp('Not met'), Q3: resp('N/A') };

  it('Site: all 6 in scope', () => {
    const r = scoreAudit(lib, 'Site', all);
    expect(r.criteria).toHaveLength(6);
    expect(r.overall.points).toBe(2); // 1 + 0.5 + 0 + 0.5 + 0
    expect(r.overall.scored).toBe(5);
    expect(r.overall.pct).toBe(40);
    expect(r.overall.maturity!.name).toBe('Developing');
    expect(r.gaps.map((g) => `${g.criterion.id}:${g.priority}`)).toEqual(['Q2:CRITICAL', 'P3:HIGH', 'Q1:HIGH', 'P2:MEDIUM']);
    expect(r.critical.map((c) => `${c.criterion.id}:${c.rating}`)).toEqual(['Q1:Partial', 'Q2:Not met']);
  });

  it('Department: Department + All levels only (P2, P3, Q1, Q3)', () => {
    const r = scoreAudit(lib, 'Department', all);
    expect(r.criteria.map((c) => c.id)).toEqual(['P2', 'P3', 'Q1', 'Q3']);
    expect(r.overall.points).toBe(1);
    expect(r.overall.scored).toBe(3);
    expect(r.overall.pct).toBe(33);
    expect(r.overall.maturity!.name).toBe('Reactive');
    expect(r.critical.map((c) => c.criterion.id)).toEqual(['Q1']);
  });

  it('Sub-department: All levels only (P3, Q1, Q3); ratings outside scope are ignored', () => {
    const r = scoreAudit(lib, 'Sub-department', all);
    expect(r.criteria.map((c) => c.id)).toEqual(['P3', 'Q1', 'Q3']);
    expect(r.overall.points).toBe(0.5);
    expect(r.overall.scored).toBe(2);
    expect(r.overall.pct).toBe(25);
    expect(r.gaps.map((g) => g.criterion.id)).toEqual(['P3', 'Q1']);
  });

  it('area scores use the same formula; an area with nothing in scope is "not scored"', () => {
    const custom = parseLibrary(structuredClone(sample));
    custom.criteria = custom.criteria.map((c) => (c.area === 'P' ? { ...c, scope: 'Site' as const } : c));
    const r = scoreAudit(custom, 'Sub-department', all);
    const p = r.areas.find((a) => a.code === 'P')!;
    const q = r.areas.find((a) => a.code === 'Q')!;
    expect(p.hasScope).toBe(false);
    expect(p.result.pct).toBeNull();
    expect(q.result.pct).toBe(50); // Q1 Partial (0.5) / 1 scored; Q3 N/A
  });

  it('unrated in-scope criteria are listed', () => {
    const r = scoreAudit(lib, 'Site', { P1: resp('Met') });
    expect(r.unrated.map((c) => c.id)).toEqual(['P2', 'P3', 'Q1', 'Q2', 'Q3']);
    expect(r.overall.pct).toBe(100);
  });
});
