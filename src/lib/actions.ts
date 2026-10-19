import type { Audit, Priority, Rating } from '../types';
import { scoreOf } from './scoring';
import { TO_BE_AGREED } from './summary';

export const ACTION_COLUMNS = ['ID', 'Area', 'Criterion', 'Rating', 'Priority', 'Action', 'Owner', 'Due date', 'Status', 'Notes'] as const;
export const STATUS_OPTIONS = ['Not started', 'In progress', 'Done'];

export interface ActionRow {
  id: string;
  area: string;
  criterion: string;
  rating: Rating;
  priority: Priority;
  action: string;
  owner: string;
  due: string; // YYYY-MM-DD or ''
  status: string;
  notes: string;
}

/** One row per gap, sorted by priority then criterion order. */
export function actionRows(audit: Audit): ActionRow[] {
  const r = scoreOf(audit);
  const areaName = new Map(audit.library.areas.map((a) => [a.code, `${a.code}. ${a.name}`]));
  return r.gaps.map((g) => ({
    id: g.criterion.id,
    area: areaName.get(g.criterion.area) ?? g.criterion.area,
    criterion: g.criterion.text,
    rating: g.rating,
    priority: g.priority,
    action: g.response.action?.trim() || TO_BE_AGREED,
    owner: g.response.owner?.trim() ?? '',
    due: g.response.due ?? '',
    status: 'Not started',
    // Left blank for the client to track progress.
    notes: '',
  }));
}
