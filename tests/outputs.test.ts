import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import ExcelJS from 'exceljs';
import sample from './fixtures/sample_library.json';
import type { Audit, Library, Rating } from '../src/types';
import { DEFAULT_BRAND } from '../src/types';
import { parseLibrary } from '../src/lib/library';
import { blankSetup, newAudit, emptyResponse } from '../src/lib/audit';
import { buildActionsDoc, buildReportDoc, FONT } from '../src/lib/report-doc';
import { buildActionsWorkbook } from '../src/lib/xlsx';
import { actionRows } from '../src/lib/actions';
import { fileBase } from '../src/lib/filenames';
import { scoreOf } from '../src/lib/scoring';

const require = createRequire(import.meta.url);

/** Made-up library with many criteria, to force long tables across pages. */
function bigLibrary(n: number): Library {
  const lib = parseLibrary(structuredClone(sample));
  lib.criteria = Array.from({ length: n }, (_, i) => ({
    id: `${i % 2 ? 'Q' : 'P'}${i + 1}`,
    area: i % 2 ? 'Q' : 'P',
    text: `Made-up criterion number ${i + 1} with enough words to wrap onto a second line in the table`,
    scope: 'All levels' as const,
    critical: i % 7 === 0,
    refs: {},
  }));
  return lib;
}

function auditWith(lib: Library, rate: (i: number) => Rating | undefined): Audit {
  const a = newAudit(lib, { ...blankSetup(), client: 'Acme Foods', site: 'Leeds', level: 'Site', date: '2026-10-19', scope: 'Whole site' });
  lib.criteria.forEach((c, i) => {
    const r = rate(i);
    if (r) a.responses[c.id] = { ...emptyResponse(), rating: r, action: i % 3 ? `Fix ${c.id}` : '', owner: 'QA lead' };
  });
  a.status = 'finished';
  return a;
}

/** Every piece of text in a pdfmake definition. */
function allText(node: any, out: string[] = []): string[] {
  if (node == null) return out;
  if (typeof node === 'string') out.push(node);
  else if (Array.isArray(node)) node.forEach((n) => allText(n, out));
  else if (typeof node === 'object') {
    if (typeof node.text === 'string') out.push(node.text);
    else if (node.text) allText(node.text, out);
    for (const k of ['stack', 'columns', 'ul', 'content']) if (node[k]) allText(node[k], out);
    if (node.table) allText(node.table.body, out);
  }
  return out;
}

function gapTable(doc: any) {
  return doc.content.find((n: any) => n.table?.body?.[0]?.[0]?.text === 'ID' && n.table.body[0][5]?.text === 'Owner');
}

async function renderPdf(doc: any): Promise<Buffer> {
  const pdfmake = require('pdfmake');
  const dir = require.resolve('@expo-google-fonts/arimo/package.json').replace(/package\.json$/, '');
  pdfmake.setFonts({
    [FONT]: {
      normal: dir + '400Regular/Arimo_400Regular.ttf',
      bold: dir + '700Bold/Arimo_700Bold.ttf',
      italics: dir + '400Regular_Italic/Arimo_400Regular_Italic.ttf',
      bolditalics: dir + '700Bold_Italic/Arimo_700Bold_Italic.ttf',
    },
  });
  pdfmake.setUrlAccessPolicy(() => false);
  pdfmake.setLocalAccessPolicy(() => true);
  return pdfmake.createPdf(doc).getBuffer();
}

describe('client report', () => {
  it('lists every gap, in priority order, even when there are many', async () => {
    const lib = bigLibrary(80);
    const audit = auditWith(lib, (i) => (i % 4 === 0 ? 'Met' : i % 4 === 1 ? 'Partial' : 'Not met'));
    const r = scoreOf(audit);
    expect(r.gaps.length).toBe(60);
    const doc = buildReportDoc({ audit, brand: DEFAULT_BRAND, photos: [], version: '1.0' });
    const table = gapTable(doc);
    const ids = table.table.body.slice(1).map((row: any) => row[0].text);
    expect(ids).toEqual(r.gaps.map((g) => g.criterion.id));
    expect(table.table.headerRows).toBe(1); // header repeats on each page
    const pdf = await renderPdf(doc);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  }, 30000);

  it('shows "To be agreed" for blank actions and the critical-criteria line', () => {
    const lib = parseLibrary(structuredClone(sample));
    const audit = auditWith(lib, (i) => (['Partial', 'Met', 'Not met', 'Met', 'Met', 'N/A'] as Rating[])[i]);
    const text = allText(buildReportDoc({ audit, brand: DEFAULT_BRAND, photos: [], version: '1.0' }).content).join('\n');
    expect(text).toContain('To be agreed');
    expect(text).toContain('No critical gaps. Critical criteria at this level: Q1 met, Q2 met.');
    expect(text).toContain('Standards references are indicative cross-references, not a certification checklist.');
    expect(text).toContain('Training System Audit Report');
  });

  it('lists unrated criteria as not assessed, and shows the previous-audit comparison', async () => {
    const lib = parseLibrary(structuredClone(sample));
    const audit = auditWith(lib, (i) => (i < 4 ? 'Met' : undefined));
    audit.previous = { auditId: 'x', date: '2025-03-01', pct: 57, areaPct: { P: 50, Q: 60 } };
    const doc = buildReportDoc({ audit, brand: DEFAULT_BRAND, photos: [], version: '1.0' });
    const text = allText(doc.content).join('\n');
    expect(text).toContain('Not assessed (2)');
    expect(text).toContain('Previous audit 57% (1 Mar 2025) → this audit 100%');
    await renderPdf(doc);
  }, 30000);

  it('renders photos and signatures', async () => {
    const lib = parseLibrary(structuredClone(sample));
    const audit = auditWith(lib, () => 'Partial');
    // 1x1 white PNG
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
    audit.signatures.assessor = { name: 'Paulo Ferreira', role: 'Lead assessor', image: png };
    const doc = buildReportDoc({ audit, brand: DEFAULT_BRAND, photos: [{ criterionId: 'P1', dataUrl: png, width: 1, height: 1 }, { criterionId: 'P1', dataUrl: png, width: 1, height: 1 }], version: '1.0' });
    const text = allText(doc.content).join('\n');
    expect(text).toContain('P1 – photo 1');
    expect(text).toContain('P1 – photo 2');
    const pdf = await renderPdf(doc);
    expect(pdf.length).toBeGreaterThan(1000);
  }, 30000);
});

describe('action list', () => {
  const lib = parseLibrary(structuredClone(sample));
  const audit = auditWith(lib, (i) => (['Partial', 'Not met', 'Met', 'Partial', 'Not met', 'N/A'] as Rating[])[i]);
  audit.responses.P2.due = '2026-12-01';

  it('has one row per gap, sorted by priority, status "Not started"', () => {
    const rows = actionRows(audit);
    expect(rows.map((r) => `${r.id}:${r.priority}`)).toEqual(['Q2:CRITICAL', 'P2:HIGH', 'Q1:HIGH', 'P1:MEDIUM']);
    expect(rows.every((r) => r.status === 'Not started')).toBe(true);
    expect(rows.find((r) => r.id === 'P1')!.action).toBe('To be agreed');
  });

  it('PDF renders with all ten columns', async () => {
    const doc = buildActionsDoc(audit, DEFAULT_BRAND, '1.0');
    const table = doc.content.find((n: any) => n.table?.body?.[0]?.[0]?.text === 'ID');
    expect(table.table.body[0].map((c: any) => c.text)).toEqual(['ID', 'Area', 'Criterion', 'Rating', 'Priority', 'Action', 'Owner', 'Due date', 'Status', 'Notes']);
    expect(table.table.body).toHaveLength(5);
    await renderPdf(doc);
  }, 30000);

  it('Excel has filters, a frozen header and every action', async () => {
    const wb = buildActionsWorkbook(audit, DEFAULT_BRAND);
    const buf = await wb.xlsx.writeBuffer();
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(buf as ArrayBuffer);
    const ws = back.getWorksheet('Actions')!;
    expect(ws.getRow(1).values).toEqual([, 'ID', 'Area', 'Criterion', 'Rating', 'Priority', 'Action', 'Owner', 'Due date', 'Status', 'Notes']);
    expect(ws.rowCount).toBe(5);
    expect(ws.getCell('A2').value).toBe('Q2');
    expect(ws.getCell('I2').value).toBe('Not started');
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(ws.autoFilter).toBeTruthy();
    const due = ws.getCell('H3').value as Date;
    expect(due.toISOString().slice(0, 10)).toBe('2026-12-01');
  });

  it('file names follow Client_Site_Level_YYYY-MM-DD', () => {
    const a = { ...audit, setup: { ...audit.setup, client: 'Acme Foods Ltd', site: "St. John's", level: 'Sub-department' as const } };
    expect(fileBase(a)).toBe('Acme-Foods-Ltd_St-John-s_Sub-department_2026-10-19');
  });
});
