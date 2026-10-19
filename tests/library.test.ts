import { describe, expect, it } from 'vitest';
import sample from './fixtures/sample_library.json';
import { inScope, nextCriterionId, parseLibrary, snapshotLibrary } from '../src/lib/library';
import { blankSetup, newAudit, normaliseSetup, reauditFrom, sameScope } from '../src/lib/audit';

describe('criteria library import', () => {
  it('accepts a valid library and keeps every criterion unchanged', () => {
    const lib = parseLibrary(structuredClone(sample));
    expect(lib.areas.map((a) => a.code)).toEqual(['P', 'Q']);
    expect(lib.criteria).toHaveLength(6);
    expect(lib.criteria.map((c) => c.text)).toEqual(sample.criteria.map((c) => c.text));
    expect(lib.criteria.filter((c) => c.critical).map((c) => c.id)).toEqual(['Q1', 'Q2']);
  });

  it('rejects files that are not a library', () => {
    expect(() => parseLibrary({})).toThrow(/areas/);
    expect(() => parseLibrary({ areas: [{ code: 'P', name: 'x' }], criteria: [] })).toThrow(/criteria/);
  });

  it('rejects bad scope tags, unknown areas and duplicate IDs', () => {
    const bad1 = structuredClone(sample) as any;
    bad1.criteria[0].scope = 'Everywhere';
    expect(() => parseLibrary(bad1)).toThrow(/scope/);
    const bad2 = structuredClone(sample) as any;
    bad2.criteria[0].area = 'Z';
    expect(() => parseLibrary(bad2)).toThrow(/unknown area/);
    const bad3 = structuredClone(sample) as any;
    bad3.criteria[1].id = 'P1';
    expect(() => parseLibrary(bad3)).toThrow(/twice/);
  });

  it('applies the scope rules at each level', () => {
    const lib = parseLibrary(structuredClone(sample));
    expect(inScope(lib, 'Site').map((c) => c.id)).toEqual(['P1', 'P2', 'P3', 'Q1', 'Q2', 'Q3']);
    expect(inScope(lib, 'Department').map((c) => c.id)).toEqual(['P2', 'P3', 'Q1', 'Q3']);
    expect(inScope(lib, 'Sub-department').map((c) => c.id)).toEqual(['P3', 'Q1', 'Q3']);
  });

  it('leaves switched-off criteria out of the audit snapshot', () => {
    const lib = parseLibrary(structuredClone(sample));
    lib.criteria[0].off = true;
    const snap = snapshotLibrary(lib);
    expect(snap.criteria.map((c) => c.id)).not.toContain('P1');
    expect(inScope(snap, 'Site')).toHaveLength(5);
  });

  it('snapshot is a separate copy, so later library edits do not change an audit', () => {
    const lib = parseLibrary(structuredClone(sample));
    const audit = newAudit(lib);
    lib.criteria[0].text = 'Changed later';
    expect(audit.library.criteria[0].text).toBe(sample.criteria[0].text);
  });

  it('gives new criteria the next free ID in their area', () => {
    const lib = parseLibrary(structuredClone(sample));
    expect(nextCriterionId(lib, 'P')).toBe('P4');
    expect(nextCriterionId(lib, 'Q')).toBe('Q4');
  });
});

describe('audit set-up', () => {
  it('clears department fields the level does not use', () => {
    const s = { ...blankSetup(), level: 'Site' as const, department: 'X', subDepartment: 'Y' };
    expect(normaliseSetup(s)).toMatchObject({ department: '', subDepartment: '' });
    expect(normaliseSetup({ ...s, level: 'Department' })).toMatchObject({ department: 'X', subDepartment: '' });
    expect(normaliseSetup({ ...s, level: 'Sub-department' })).toMatchObject({ department: 'X', subDepartment: 'Y' });
  });

  it('re-audit copies client details only, never ratings', () => {
    const lib = parseLibrary(structuredClone(sample));
    const prev = newAudit(lib, { ...blankSetup(), client: 'Acme', site: 'Leeds', level: 'Department', department: 'Packing', scope: 'All lines', notes: 'old notes', date: '2025-01-01' });
    prev.responses.P2 = { rating: 'Met', notes: 'n', photoIds: ['x'], action: 'a', owner: 'o', due: '' };
    const next = reauditFrom(prev, lib);
    expect(next.id).not.toBe(prev.id);
    expect(next.responses).toEqual({});
    expect(next.setup).toMatchObject({ client: 'Acme', site: 'Leeds', level: 'Department', department: 'Packing', scope: 'All lines', notes: '' });
    expect(next.setup.date).not.toBe('2025-01-01');
    expect(next.compareWithId).toBe(prev.id);
    expect(sameScope(prev.setup, next.setup)).toBe(true);
  });
});
