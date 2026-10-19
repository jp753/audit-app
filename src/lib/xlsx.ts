import ExcelJS from 'exceljs';
import type { Audit, Brand } from '../types';
import { actionRows, ACTION_COLUMNS, STATUS_OPTIONS } from './actions';
import { formatDate } from './audit';
import { TO_BE_AGREED } from './summary';

const argb = (hex: string) => 'FF' + hex.replace('#', '').toUpperCase();

/** Action list workbook: filters on, header row frozen, ready for the client to work from. */
export function buildActionsWorkbook(audit: Audit, brand: Brand): ExcelJS.Workbook {
  const s = audit.setup;
  const rows = actionRows(audit);
  const wb = new ExcelJS.Workbook();
  wb.creator = brand.name;
  wb.created = new Date();
  wb.title = `Action List – ${s.client} – ${s.site}`;

  const ws = wb.addWorksheet('Actions', {
    views: [{ state: 'frozen', ySplit: 1, xSplit: 0, activeCell: 'A2' }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1' },
  });
  const widths = [7, 26, 48, 10, 11, 44, 18, 13, 14, 30];
  ws.columns = ACTION_COLUMNS.map((h, i) => ({ header: h, key: h, width: widths[i] }));

  const header = ws.getRow(1);
  header.height = 22;
  header.eachCell((c) => {
    c.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(brand.navy) } };
    c.alignment = { vertical: 'middle' };
  });

  const PRIORITY_FILL: Record<string, [string, string]> = {
    CRITICAL: ['8F1D22', 'FFFFFF'], HIGH: ['C0262D', 'FFFFFF'], MEDIUM: ['F0A202', '1A1A1A'],
  };

  for (const r of rows) {
    const row = ws.addRow([
      r.id, r.area, r.criterion, r.rating, r.priority,
      r.action, r.owner, r.due ? isoToDate(r.due) : '', r.status, r.notes,
    ]);
    row.eachCell({ includeEmpty: true }, (c, col) => {
      c.font = { name: 'Arial', size: 10, bold: col === 1 };
      c.alignment = { vertical: 'top', wrapText: true };
      c.border = { bottom: { style: 'thin', color: { argb: 'FFC9D1DC' } } };
    });
    const p = row.getCell(5);
    const [bg, fg] = PRIORITY_FILL[r.priority];
    p.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bg } };
    p.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF' + fg } };
    if (r.action === TO_BE_AGREED) row.getCell(6).font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FFB86E00' } };
    row.getCell(8).numFmt = 'dd mmm yyyy';
    row.getCell(9).dataValidation = {
      type: 'list', allowBlank: true, formulae: [`"${STATUS_OPTIONS.join(',')}"`],
      showErrorMessage: false,
    };
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, rows.length + 1), column: ACTION_COLUMNS.length } };

  // A second sheet with the audit details.
  const info = wb.addWorksheet('About');
  info.columns = [{ width: 18 }, { width: 60 }];
  const lines: [string, string][] = [
    ['Action list', `${brand.name} – ${brand.tagline}`],
    ['Client', s.client],
    ['Site', s.site],
    ['Level', s.level],
    ...(s.department ? [['Department', s.department] as [string, string]] : []),
    ...(s.subDepartment ? [['Sub-department', s.subDepartment] as [string, string]] : []),
    ['Lead assessor', s.assessor],
    ['Audit date', formatDate(s.date)],
    ['Actions', String(rows.length)],
    ['Status options', STATUS_OPTIONS.join(', ')],
  ];
  for (const [k, v] of lines) {
    const row = info.addRow([k, v]);
    row.getCell(1).font = { name: 'Arial', bold: true };
    row.getCell(2).font = { name: 'Arial' };
  }
  return wb;
}

function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  // Midday UTC so the date never shifts with time zones.
  return new Date(Date.UTC(y, m - 1, d, 12));
}
