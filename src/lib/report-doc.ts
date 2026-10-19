// Builds the pdfmake document definitions for the client report and the
// action list. Pure functions: no browser APIs, so they can be tested.
import type { Audit, Brand, Priority, Rating } from '../types';
import { formatDate } from './audit';
import { changeText } from './compare';
import { formatPct, MATURITY_BANDS, scoreOf } from './scoring';
import { criticalLine, NOT_ASSESSED, summaryLines, TO_BE_AGREED } from './summary';
import { actionRows, ACTION_COLUMNS } from './actions';
import { followUpCounts, followUpRows, type FollowUpStatus } from './followup';

type Node = any;

export interface PdfPhoto {
  criterionId: string;
  dataUrl: string;
  width: number;
  height: number;
}

export interface ReportInput {
  audit: Audit;
  brand: Brand;
  photos: PdfPhoto[];
  version: string;
}

export const FONT = 'Arimo';
const GREY = '#4A5568';
const LINE = '#C9D1DC';
const LIGHT = '#F2F4F7';
const PRIORITY_FILL: Record<Priority, { fill: string; color: string }> = {
  CRITICAL: { fill: '#8F1D22', color: '#FFFFFF' },
  HIGH: { fill: '#C0262D', color: '#FFFFFF' },
  MEDIUM: { fill: '#F0A202', color: '#1A1A1A' },
};
const RATING_COLOR: Record<Rating, string> = { Met: '#1B7F3B', Partial: '#B86E00', 'Not met': '#C0262D', 'N/A': '#5A6472' };

const TICK_SVG = '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M4 12.5l5 5L20 6.5" fill="none" stroke="#1B7F3B" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const WARN_SVG = '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M12 2.5L23 21.5H1z" fill="#C0262D"/><path d="M12 9v6" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="18.2" r="1.4" fill="#fff"/></svg>';

const tableLayout = {
  hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length ? 0.8 : 0.5),
  vLineWidth: () => 0,
  hLineColor: () => LINE,
  paddingLeft: () => 5,
  paddingRight: () => 5,
  paddingTop: () => 4,
  paddingBottom: () => 4,
};
const noLines = {
  hLineWidth: () => 0, vLineWidth: () => 0,
  paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
};

function levelText(a: Audit): string {
  const s = a.setup;
  return [s.level, s.level !== 'Site' ? s.department : '', s.level === 'Sub-department' ? s.subDepartment : '']
    .filter(Boolean).join(' · ');
}

/** Brand band used at the top of both documents. */
function brandBand(brand: Brand, title: string, width: number): Node {
  const mark: Node = brand.logo
    ? { image: brand.logo, fit: [64, 44], width: 64 }
    : {
        width: 44,
        stack: [
          { table: { widths: [44], heights: [38], body: [[{ text: brand.monogram || '', color: '#FFFFFF', bold: true, fontSize: 18, alignment: 'center', margin: [0, 9, 0, 0], fillColor: brand.teal }]] }, layout: noLines },
          { canvas: [{ type: 'rect', x: 0, y: 0, w: 44, h: 4, color: brand.amber }] },
        ],
      };
  return {
    table: {
      widths: [width],
      body: [[{
        fillColor: brand.navy,
        margin: [14, 12, 14, 12],
        columns: [
          mark,
          { width: '*', margin: [12, 2, 0, 0], stack: [
            { text: brand.name, color: '#FFFFFF', bold: true, fontSize: 14 },
            { text: brand.tagline, color: '#CFE7EA', fontSize: 10, margin: [0, 2, 0, 0] },
          ] },
          { width: 'auto', text: title, color: '#FFFFFF', fontSize: 10, alignment: 'right', margin: [0, 4, 0, 0] },
        ],
      }]],
    },
    layout: noLines,
  };
}

function footer(brand: Brand, client: string, version: string) {
  return (currentPage: number, pageCount: number): Node => ({
    margin: [40, 12, 40, 0],
    fontSize: 8,
    color: GREY,
    columns: [
      { text: brand.name, width: '*' },
      { text: client, width: '*', alignment: 'center' },
      { text: `Page ${currentPage} of ${pageCount}`, width: '*', alignment: 'right' },
      { text: `App v${version}`, width: 50, alignment: 'right' },
    ],
  });
}

const h1 = (text: string, extra: Node = {}): Node => ({ text, style: 'h1', headlineLevel: 1, ...extra });

/** Avoid a heading sitting alone at the bottom of a page. */
function pageBreakBefore(node: any): boolean {
  return node.headlineLevel === 1 && node.startPosition?.verticalRatio > 0.82;
}

const styles = {
  h1: { fontSize: 14, bold: true, color: '#0B2545', margin: [0, 16, 0, 6] },
  th: { bold: true, color: '#FFFFFF', fontSize: 9 },
  small: { fontSize: 8.5, color: GREY },
  label: { bold: true, color: GREY, fontSize: 9 },
};

function th(text: string, fill: string): Node {
  return { text, style: 'th', fillColor: fill };
}

function priorityCell(p: Priority): Node {
  return { text: p, bold: true, fontSize: 8.5, color: PRIORITY_FILL[p].color, fillColor: PRIORITY_FILL[p].fill, alignment: 'center' };
}
function ratingCell(r: Rating): Node {
  return { text: r, bold: true, color: RATING_COLOR[r], fontSize: 9 };
}

// ======================================================================
// Client report
// ======================================================================
export function buildReportDoc(input: ReportInput): Node {
  const { audit, brand, photos, version } = input;
  const s = audit.setup;
  const r = scoreOf(audit);
  const prev = audit.previous ?? null;
  const o = r.overall;
  const W = 515; // A4 width minus margins
  const content: Node[] = [];

  // 1. Header
  content.push(brandBand(brand, 'Client report', W));
  content.push({ text: 'Training System Audit Report', fontSize: 22, bold: true, color: brand.navy, margin: [0, 16, 0, 8] });
  const details: [string, string][] = [
    ['Client', s.client],
    ['Site', s.site],
    ['Level', levelText(audit)],
    ['Scope', s.scope || '–'],
    ['Lead assessor', s.assessor],
    ['Audit date', formatDate(s.date)],
  ];
  content.push({
    table: { widths: [90, '*'], body: details.map(([k, v]) => [{ text: k, style: 'label' }, { text: v }]) },
    layout: tableLayout,
  });

  // 2. Score tiles
  const tile = (big: string, line: string, fill: string, color: string): Node => ({
    fillColor: fill, margin: [10, 10, 10, 10],
    stack: [{ text: big, fontSize: 26, bold: true, color }, { text: line, fontSize: 10, color }],
  });
  const tiles: Node[] = [tile(formatPct(o.pct), o.maturity ? `Level ${o.maturity.level} · ${o.maturity.name}` : 'No maturity level', brand.navy, '#FFFFFF')];
  if (prev) {
    tiles.push(tile(formatPct(prev.pct), `Previous audit (${formatDate(prev.date)})`, LIGHT, brand.navy));
    tiles.push(tile(changeText(o.pct, prev.pct), 'Change (points)', LIGHT, brand.teal));
  }
  content.push({
    margin: [0, 14, 0, 0],
    table: { widths: tiles.map(() => '*'), body: [tiles] },
    layout: { ...noLines, vLineWidth: (i: number) => (i > 0 && i < tiles.length ? 6 : 0), vLineColor: () => '#FFFFFF' },
  });
  if (prev) {
    content.push({ text: `Previous audit ${formatPct(prev.pct)} (${formatDate(prev.date)}) → this audit ${formatPct(o.pct)}`, margin: [0, 6, 0, 0], bold: true, color: brand.navy });
  }

  // 3. Summary
  content.push(h1('Summary'));
  content.push({ ul: summaryLines(r, prev), margin: [0, 0, 0, 4] });

  // 4. Priority gaps and actions
  content.push(h1(`Priority gaps and actions (${r.gaps.length})`));
  const crit = criticalLine(r);
  content.push({
    columns: [{ svg: crit.ok ? TICK_SVG : WARN_SVG, width: 13, margin: [0, 0, 0, 0] }, { text: crit.text, width: '*', bold: true, color: crit.ok ? '#1B7F3B' : '#C0262D', margin: [6, 0, 0, 0] }],
    margin: [0, 0, 0, 8],
  });
  if (r.gaps.length === 0) {
    content.push({ text: 'No gaps: every rated criterion was Met or N/A.', italics: true });
  } else {
    content.push({
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths: [24, '*', 42, 50, 130, 64],
        body: [
          ['ID', 'Criterion', 'Rating', 'Priority', 'Action', 'Owner'].map((t) => th(t, brand.navy)),
          ...r.gaps.map((g) => [
            { text: g.criterion.id, bold: true },
            { text: g.criterion.text, fontSize: 9 },
            ratingCell(g.rating),
            priorityCell(g.priority),
            {
              stack: [
                g.response.action?.trim() ? { text: g.response.action.trim(), fontSize: 9 } : { text: TO_BE_AGREED, fontSize: 9, italics: true, color: '#B86E00' },
                ...(g.response.due ? [{ text: `Due ${formatDate(g.response.due)}`, style: 'small', margin: [0, 2, 0, 0] }] : []),
              ],
            },
            { text: g.response.owner?.trim() || '–', fontSize: 9 },
          ]),
        ],
      },
      layout: tableLayout,
      fontSize: 9.5,
    });
  }

  if (r.unrated.length) {
    content.push(h1(`Not assessed (${r.unrated.length})`));
    content.push({ text: 'These in-scope criteria were not rated and are not included in the score.', style: 'small', margin: [0, 0, 0, 4] });
    content.push({
      table: { headerRows: 0, widths: [24, '*', 70], body: r.unrated.map((c) => [{ text: c.id, bold: true }, { text: c.text, fontSize: 9 }, { text: NOT_ASSESSED, style: 'small' }]) },
      layout: tableLayout,
      fontSize: 9.5,
    });
  }

  // Follow-up of the previous audit's actions (only when compared).
  const fu = followUpRows(audit, prev);
  if (fu.length) {
    const fc = followUpCounts(fu);
    const STATUS_COLOR: Record<FollowUpStatus, string> = {
      Closed: '#1B7F3B', Improved: '#13838F', Open: '#C0262D', 'No longer applicable': GREY, 'Not assessed': GREY,
    };
    content.push(h1(`Follow-up of previous actions (${fu.length})`));
    content.push({
      text: `Gaps from the previous audit (${formatDate(prev!.date)}): ${fc.Closed} closed, ${fc.Improved} improved, ${fc.Open} still open` +
        (fc['No longer applicable'] ? `, ${fc['No longer applicable']} no longer applicable` : '') +
        (fc['Not assessed'] ? `, ${fc['Not assessed']} not assessed` : '') + '.',
      margin: [0, 0, 0, 6],
    });
    content.push({
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths: [24, '*', 52, 120, 52, 62],
        body: [
          ['ID', 'Criterion', 'Previous', 'Previous action', 'Now', 'Status'].map((t) => th(t, brand.navy)),
          ...fu.map((r) => [
            { text: r.prev.id, bold: true },
            { text: r.prev.text, fontSize: 9 },
            ratingCell(r.prev.rating),
            { text: r.prev.action || TO_BE_AGREED, fontSize: 9, italics: !r.prev.action, color: r.prev.action ? undefined : GREY },
            r.now ? ratingCell(r.now) : { text: NOT_ASSESSED, style: 'small' },
            { text: r.status, bold: true, fontSize: 9, color: STATUS_COLOR[r.status] },
          ]),
        ],
      },
      layout: tableLayout,
      fontSize: 9.5,
    });
  }

  // 5. Results by area
  content.push(h1('Results by area'));
  const areaHead = ['Area', 'In scope', 'Score'];
  if (prev) areaHead.push('Previous', 'Change');
  content.push({
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: prev ? ['*', 45, 50, 55, 45] : ['*', 55, 60],
      body: [
        areaHead.map((t, i) => ({ ...th(t, brand.navy), alignment: i === 0 ? 'left' : 'right' })),
        ...r.areas.map((a) => {
          const p = prev?.areaPct[a.code];
          const row: Node[] = [
            `${a.code}. ${a.name}`,
            { text: String(a.criteria.length), alignment: 'right' },
            { text: a.result.pct !== null ? `${a.result.pct}%` : 'not scored', alignment: 'right', color: a.result.pct !== null ? undefined : GREY, italics: a.result.pct === null },
          ];
          if (prev) {
            row.push({ text: p === null || p === undefined ? '–' : `${p}%`, alignment: 'right' });
            row.push({ text: changeText(a.result.pct, p), alignment: 'right' });
          }
          return row;
        }),
      ],
    },
    layout: tableLayout,
    fontSize: 9.5,
  });

  // Horizontal bar chart: this audit (teal) vs previous (grey).
  const chartAreas = r.areas.filter((a) => a.hasScope && a.result.pct !== null);
  if (chartAreas.length) {
    const BAR_W = 250;
    const legend: Node[] = [
      { canvas: [{ type: 'rect', x: 0, y: 2, w: 10, h: 8, color: brand.teal }], width: 14 },
      { text: 'This audit', width: 'auto', fontSize: 8.5, margin: [0, 0, 14, 0] },
    ];
    if (prev) {
      legend.push({ canvas: [{ type: 'rect', x: 0, y: 2, w: 10, h: 8, color: '#9AA5B1' }], width: 14 });
      legend.push({ text: `Previous audit (${formatDate(prev.date)})`, width: 'auto', fontSize: 8.5 });
    }
    content.push({ columns: legend, margin: [0, 12, 0, 6], unbreakable: true });
    content.push({
      table: {
        dontBreakRows: true,
        widths: [150, BAR_W + 6, '*'],
        body: chartAreas.map((a) => {
          const now = a.result.pct!;
          const p = prev?.areaPct[a.code];
          const bars: Node[] = [
            { type: 'rect', x: 0, y: 0, w: BAR_W, h: 10, color: '#E6EBF1' },
            { type: 'rect', x: 0, y: 0, w: Math.max(1, (BAR_W * now) / 100), h: 10, color: brand.teal },
          ];
          if (prev && p !== null && p !== undefined) {
            bars.push({ type: 'rect', x: 0, y: 12, w: BAR_W, h: 6, color: '#F2F4F7' });
            bars.push({ type: 'rect', x: 0, y: 12, w: Math.max(1, (BAR_W * p) / 100), h: 6, color: '#9AA5B1' });
          }
          return [
            { text: `${a.code}. ${a.name}`, fontSize: 8.5 },
            { canvas: bars },
            { text: prev && p !== null && p !== undefined ? `${now}%  (${p}%)` : `${now}%`, fontSize: 8.5, bold: true },
          ];
        }),
      },
      layout: { ...noLines, paddingBottom: () => 5 },
    });
  }

  // 6. Strengths
  content.push(h1(`Strengths (${r.strengths.length})`));
  if (r.strengths.length === 0) content.push({ text: 'No criteria were rated Met.', italics: true });
  else content.push({
    table: { widths: [24, '*'], body: r.strengths.map((c) => [{ text: c.id, bold: true, color: '#1B7F3B' }, { text: c.text, fontSize: 9 }]) },
    layout: tableLayout,
    fontSize: 9.5,
  });

  // 7. Photo appendix
  content.push(h1('Appendix: photos', { pageBreak: 'before' }));
  if (photos.length === 0) {
    content.push({ text: 'No photos were taken during this audit.', italics: true });
  } else {
    const cells: Node[] = photos.map((p, i) => {
      const n = photos.slice(0, i + 1).filter((x) => x.criterionId === p.criterionId).length;
      return {
        stack: [
          { image: p.dataUrl, fit: [245, 180], alignment: 'center' },
          { text: `${p.criterionId} – photo ${n}`, bold: true, alignment: 'center', margin: [0, 4, 0, 0], color: brand.navy },
        ],
        margin: [0, 0, 0, 10],
      };
    });
    const rows: Node[][] = [];
    for (let i = 0; i < cells.length; i += 2) rows.push([cells[i], cells[i + 1] ?? { text: '' }]);
    content.push({ table: { widths: ['*', '*'], dontBreakRows: true, body: rows }, layout: { ...noLines, paddingLeft: () => 4, paddingRight: () => 4 } });
  }

  // 8. Sign-off
  content.push(h1('Sign-off'));
  const sigCol = (title: string, sig: Audit['signatures']['assessor']): Node => ({
    width: '*',
    stack: [
      { text: title, style: 'label', margin: [0, 0, 0, 4] },
      sig.image ? { image: sig.image, fit: [220, 70], height: 70 } : { text: 'Not signed', italics: true, color: GREY, margin: [0, 26, 0, 30] },
      { canvas: [{ type: 'line', x1: 0, y1: 2, x2: 230, y2: 2, lineWidth: 0.8, lineColor: GREY }] },
      { text: sig.name || '–', bold: true, margin: [0, 4, 0, 0] },
      { text: sig.role || '–', style: 'small' },
      { text: `Date: ${formatDate((sig.signedAt ?? s.date).slice(0, 10))}`, style: 'small' },
    ],
  });
  content.push({ unbreakable: true, columns: [sigCol('Lead assessor', audit.signatures.assessor), sigCol('Client contact', audit.signatures.client)], columnGap: 30 });

  // 9. Method note
  const rules = audit.library.scope_rules;
  content.push(h1('Method'));
  content.push({
    fontSize: 9,
    stack: [
      { ul: [
        'Each in-scope criterion is rated Met (1 point), Partial (0.5) or Not met (0). N/A and criteria not assessed are excluded.',
        'Score = points ÷ number of in-scope criteria rated Met, Partial or Not met. Area scores use the same formula, restricted to that area; an area with no criteria in scope is "not scored".',
        'Scores are shown as whole percentages. The maturity level is set from the whole percentage shown.',
        `Criteria in scope: Site audits use criteria tagged ${rules.Site.join(', ')}; Department audits use ${rules.Department.join(', ')}; Sub-department audits use ${rules['Sub-department'].join(', ')}.`,
        'Priority: Not met = HIGH (CRITICAL for a critical criterion); Partial = MEDIUM (HIGH for a critical criterion). Gaps are listed CRITICAL, then HIGH, then MEDIUM.',
      ], margin: [0, 0, 0, 8] },
      {
        table: {
          widths: [40, 100, '*'],
          body: [
            ['Level', 'Name', 'Score'].map((t) => th(t, brand.navy)),
            ...[...MATURITY_BANDS].reverse().map((b) => [String(b.level), b.name, b.label]),
          ],
        },
        layout: tableLayout,
        margin: [0, 0, 0, 8],
      },
      { text: 'Standards references are indicative cross-references, not a certification checklist.', italics: true },
      { text: `Criteria library: ${audit.library.library}${audit.library.version ? ' v' + audit.library.version : ''}.`, style: 'small', margin: [0, 4, 0, 0] },
    ],
  });

  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: [40, 40, 40, 50],
    info: { title: `Training System Audit Report – ${s.client} – ${s.site}`, author: brand.name, subject: 'Training System Audit Report' },
    defaultStyle: { font: FONT, fontSize: 10, lineHeight: 1.15, color: '#0D1B2A' },
    styles,
    footer: footer(brand, s.client, version),
    pageBreakBefore,
    content,
  };
}

// ======================================================================
// Action list (A4 landscape, so all ten columns fit)
// ======================================================================
export function buildActionsDoc(audit: Audit, brand: Brand, version: string): Node {
  const s = audit.setup;
  const rows = actionRows(audit);
  const W = 762; // A4 landscape width minus margins
  const content: Node[] = [];
  content.push(brandBand(brand, 'Action list', W));
  content.push({ text: 'Action List', fontSize: 20, bold: true, color: brand.navy, margin: [0, 12, 0, 4] });
  content.push({
    text: [
      { text: 'Client: ', bold: true }, `${s.client}    `,
      { text: 'Site: ', bold: true }, `${s.site}    `,
      { text: 'Level: ', bold: true }, `${levelText(audit)}    `,
      { text: 'Audit date: ', bold: true }, formatDate(s.date),
    ],
    margin: [0, 0, 0, 10],
  });
  if (rows.length === 0) {
    content.push({ text: 'No actions: there were no Partial or Not met criteria.', italics: true });
  } else {
    content.push({
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths: [22, 62, '*', 40, 50, 130, 55, 52, 48, 55],
        body: [
          ACTION_COLUMNS.map((t) => th(t, brand.navy)),
          ...rows.map((r) => [
            { text: r.id, bold: true },
            { text: r.area, fontSize: 8 },
            { text: r.criterion, fontSize: 8.5 },
            ratingCell(r.rating),
            priorityCell(r.priority),
            r.action === TO_BE_AGREED ? { text: r.action, italics: true, color: '#B86E00' } : r.action,
            r.owner || '',
            r.due ? formatDate(r.due) : '',
            r.status,
            r.notes,
          ]),
        ],
      },
      layout: { ...tableLayout, vLineWidth: (i: number, node: any) => (i === 0 || i === node.table.widths.length ? 0 : 0.5), vLineColor: () => LINE },
      fontSize: 8.5,
    });
  }
  return {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [40, 36, 40, 46],
    info: { title: `Action List – ${s.client} – ${s.site}`, author: brand.name },
    defaultStyle: { font: FONT, fontSize: 9, lineHeight: 1.15, color: '#0D1B2A' },
    styles,
    footer: footer(brand, s.client, version),
    content,
  };
}
