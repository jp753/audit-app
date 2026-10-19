import type { Audit } from '../types';
import { safeName } from './download';

/** "Client_Site_Level_YYYY-MM-DD" – add "_Report.pdf", "_Actions.pdf" or "_Actions.xlsx". */
export function fileBase(a: Audit): string {
  const s = a.setup;
  return [safeName(s.client), safeName(s.site), safeName(s.level), s.date || 'undated'].join('_');
}
