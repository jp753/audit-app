import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import sample from './fixtures/sample_library.json';
import type { Rating } from '../src/types';
import { DEFAULT_BRAND } from '../src/types';
import { parseLibrary } from '../src/lib/library';
import { blankSetup, emptyResponse, newAudit, reauditFrom } from '../src/lib/audit';
import { summarise } from '../src/lib/compare';
import { followUpCounts, followUpRows, followUpStatus } from '../src/lib/followup';
import { buildReportDoc, FONT } from '../src/lib/report-doc';

const require = createRequire(import.meta.url);
const lib = parseLibrary(structuredClone(sample));

function rated(ratings: Record<string, Rating>) {
  const a = newAudit(lib, { ...blankSetup(), client: 'Acme', site: 'Leeds', level: 'Site', date: '2026-01-10' });
  for (const [id, r] of Object.entries(ratings)) a.responses[id] = { ...emptyResponse(), rating: r, action: `Fix ${id}`, owner: 'Ann' };
  a.status = 'finished';
  return a;
}

describe('follow-up of previous actions', () => {
  it('status rules', () => {
    expect(followUpStatus('Not met', 'Met')).toBe('Closed');
    expect(followUpStatus('Partial', 'Met')).toBe('Closed');
    expect(followUpStatus('Not met', 'Partial')).toBe('Improved');
    expect(followUpStatus('Partial', 'Partial')).toBe('Open');
    expect(followUpStatus('Partial', 'Not met')).toBe('Open');
    expect(followUpStatus('Not met', 'N/A')).toBe('No longer applicable');
    expect(followUpStatus('Not met', undefined)).toBe('Not assessed');
  });

  it('links each previous gap to this audit, with its previous action', () => {
    const prev = rated({ P1: 'Not met', P2: 'Partial', P3: 'Not met', Q1: 'Not met', Q2: 'Met', Q3: 'Partial' });
    const now = reauditFrom(prev, lib);
    now.responses.P1 = { ...emptyResponse(), rating: 'Met' };
    now.responses.P3 = { ...emptyResponse(), rating: 'Partial' };
    now.responses.Q1 = { ...emptyResponse(), rating: 'Not met' };
    now.responses.Q3 = { ...emptyResponse(), rating: 'N/A' };
    const sum = summarise(prev);
    expect(sum.gaps!.map((g) => g.id)).toEqual(['Q1', 'P1', 'P3', 'P2', 'Q3']); // previous priority order
    const rows = followUpRows(now, sum);
    expect(Object.fromEntries(rows.map((r) => [r.prev.id, r.status]))).toEqual({
      Q1: 'Open', P1: 'Closed', P3: 'Improved', P2: 'Not assessed', Q3: 'No longer applicable',
    });
    expect(rows[0].prev.action).toBe('Fix Q1');
    expect(followUpCounts(rows)).toMatchObject({ Closed: 1, Improved: 1, Open: 1 });
  });

  it('report shows the follow-up section and still renders', async () => {
    const prev = rated({ P1: 'Not met', Q2: 'Partial' });
    const now = reauditFrom(prev, lib);
    now.responses.P1 = { ...emptyResponse(), rating: 'Met' };
    now.status = 'finished';
    now.previous = summarise(prev);
    const doc = buildReportDoc({ audit: now, brand: DEFAULT_BRAND, photos: [], version: '1.0' });
    const heading = doc.content.find((n: any) => typeof n.text === 'string' && n.text.startsWith('Follow-up of previous actions'));
    expect(heading.text).toBe('Follow-up of previous actions (2)');
    const pdfmake = require('pdfmake');
    const dir = require.resolve('@expo-google-fonts/arimo/package.json').replace(/package\.json$/, '');
    pdfmake.setFonts({ [FONT]: { normal: dir + '400Regular/Arimo_400Regular.ttf', bold: dir + '700Bold/Arimo_700Bold.ttf', italics: dir + '400Regular_Italic/Arimo_400Regular_Italic.ttf', bolditalics: dir + '700Bold_Italic/Arimo_700Bold_Italic.ttf' } });
    pdfmake.setUrlAccessPolicy(() => false);
    pdfmake.setLocalAccessPolicy(() => true);
    const buf: Buffer = await pdfmake.createPdf(doc).getBuffer();
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  }, 30000);

  it('no previous audit means no follow-up section', () => {
    const a = rated({ P1: 'Not met' });
    expect(followUpRows(a, null)).toEqual([]);
  });
});
