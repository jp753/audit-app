import type { Criterion, Level, Library, LibrarySnapshot, ScopeTag } from '../types';
import { LEVELS, SCOPE_TAGS } from '../types';

export const DEFAULT_SCOPE_RULES: Record<Level, ScopeTag[]> = {
  Site: ['Site', 'Department', 'All levels'],
  Department: ['Department', 'All levels'],
  'Sub-department': ['All levels'],
};

/**
 * Checks an imported criteria file and returns a clean Library.
 * Throws an Error with a plain-English message if something is wrong.
 */
export function parseLibrary(raw: unknown): Library {
  if (!raw || typeof raw !== 'object') throw new Error('The file is not a criteria library.');
  const o = raw as Record<string, any>;
  if (!Array.isArray(o.areas) || o.areas.length === 0) throw new Error('The file has no "areas" list.');
  if (!Array.isArray(o.criteria) || o.criteria.length === 0) throw new Error('The file has no "criteria" list.');

  const areaCodes = new Set<string>();
  const areas = o.areas.map((a: any, i: number) => {
    if (!a || typeof a.code !== 'string' || !a.code.trim()) throw new Error(`Area ${i + 1} has no code.`);
    if (typeof a.name !== 'string') throw new Error(`Area ${a.code} has no name.`);
    if (areaCodes.has(a.code)) throw new Error(`Area ${a.code} appears twice.`);
    areaCodes.add(a.code);
    return { code: a.code, name: a.name, why: typeof a.why === 'string' ? a.why : '' };
  });

  const ids = new Set<string>();
  const criteria: Criterion[] = o.criteria.map((c: any, i: number) => {
    if (!c || typeof c.id !== 'string' || !c.id.trim()) throw new Error(`Criterion ${i + 1} has no ID.`);
    if (ids.has(c.id)) throw new Error(`Criterion ${c.id} appears twice.`);
    ids.add(c.id);
    if (!areaCodes.has(c.area)) throw new Error(`Criterion ${c.id} belongs to unknown area "${c.area}".`);
    if (typeof c.text !== 'string' || !c.text.trim()) throw new Error(`Criterion ${c.id} has no wording.`);
    if (!SCOPE_TAGS.includes(c.scope)) {
      throw new Error(`Criterion ${c.id} has scope "${c.scope}". It must be Site, Department or All levels.`);
    }
    const crit: Criterion = {
      id: c.id,
      area: c.area,
      text: c.text,
      scope: c.scope,
      critical: c.critical === true,
      refs: c.refs && typeof c.refs === 'object' ? { ...c.refs } : {},
    };
    if (c.off === true) crit.off = true;
    return crit;
  });

  let scope_rules = DEFAULT_SCOPE_RULES;
  if (o.scope_rules && typeof o.scope_rules === 'object') {
    scope_rules = { ...DEFAULT_SCOPE_RULES };
    for (const lvl of LEVELS) {
      const r = o.scope_rules[lvl];
      if (Array.isArray(r)) {
        if (r.some((t: any) => !SCOPE_TAGS.includes(t))) throw new Error(`Scope rule for ${lvl} has an unknown tag.`);
        scope_rules[lvl] = r;
      }
    }
  }

  return {
    ...o,
    library: typeof o.library === 'string' ? o.library : 'Criteria library',
    version: typeof o.version === 'string' ? o.version : '',
    scope_rules,
    areas,
    criteria,
  } as Library;
}

/** Frozen copy of the switched-on criteria, stored inside each audit. */
export function snapshotLibrary(lib: Library): LibrarySnapshot {
  return structuredClone({
    library: lib.library,
    version: lib.version,
    scope_rules: lib.scope_rules,
    areas: lib.areas,
    criteria: lib.criteria.filter((c) => !c.off).map(({ off, ...c }) => c),
    coverage_note: typeof lib.coverage_note === 'string' ? lib.coverage_note : undefined,
  });
}

/** Criteria that count at a level, in library order. */
export function inScope(lib: Pick<LibrarySnapshot, 'criteria' | 'scope_rules'>, level: Level): Criterion[] {
  const tags = lib.scope_rules[level] ?? DEFAULT_SCOPE_RULES[level];
  return lib.criteria.filter((c) => !c.off && tags.includes(c.scope));
}

/** Next free ID in an area, e.g. "A5" after A1–A4. */
export function nextCriterionId(lib: Library, areaCode: string): string {
  let max = 0;
  for (const c of lib.criteria) {
    if (c.area !== areaCode) continue;
    const m = c.id.match(new RegExp(`^${areaCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${areaCode}${max + 1}`;
}
