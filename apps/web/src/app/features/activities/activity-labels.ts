import type { FollowUpView, SiteVisitStatus } from '@brokerdesk/shared-types';
import { istStartOfDay } from '../../shared/utils/ist-time';

/** When a follow-up stands, from the user's point of view. */
export type FollowUpTiming = 'overdue' | 'today' | 'upcoming' | 'done' | 'cancelled';

export function followUpTiming(f: Pick<FollowUpView, 'status' | 'dueAt'>, now: Date = new Date()): FollowUpTiming {
  if (f.status === 'COMPLETED') return 'done';
  if (f.status === 'CANCELLED') return 'cancelled';
  const due = new Date(f.dueAt).getTime();
  if (due < now.getTime()) return 'overdue';
  return due < istStartOfDay(now) + 86_400_000 ? 'today' : 'upcoming';
}

/** Status badges always pair colour with a text label (never colour alone). */
export const TIMING_LABELS: Readonly<Record<FollowUpTiming, string>> = {
  overdue: 'Overdue',
  today: 'Due today',
  upcoming: 'Upcoming',
  done: 'Done',
  cancelled: 'Cancelled',
};

export const TIMING_STYLES: Readonly<Record<FollowUpTiming, string>> = {
  overdue: 'bg-red-50 text-red-800 ring-red-200',
  today: 'bg-amber-50 text-amber-900 ring-amber-200',
  upcoming: 'bg-sky-50 text-sky-800 ring-sky-200',
  done: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  cancelled: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export const VISIT_STATUS_LABELS: Readonly<Record<SiteVisitStatus, string>> = {
  SCHEDULED: 'Scheduled',
  RESCHEDULED: 'Rescheduled',
  COMPLETED: 'Visited',
  CANCELLED: 'Cancelled',
};

export const VISIT_STATUS_STYLES: Readonly<Record<SiteVisitStatus, string>> = {
  SCHEDULED: 'bg-sky-50 text-sky-800 ring-sky-200',
  RESCHEDULED: 'bg-violet-50 text-violet-800 ring-violet-200',
  COMPLETED: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  CANCELLED: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export function isOpenVisit(status: SiteVisitStatus): boolean {
  return status === 'SCHEDULED' || status === 'RESCHEDULED';
}
