import { MAX_REPORT_DAYS } from '@brokerdesk/shared-types';

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

export interface ReportRange {
  /** "YYYY-MM-DD" (IST calendar dates, inclusive). */
  readonly from: string;
  readonly to: string;
  /** UTC instants: [start, end). */
  readonly start: Date;
  readonly end: Date;
}

function istDateKey(ms: number): string {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Start of an IST calendar date as a UTC instant; null if not a real date. */
function istStart(date: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const utc = Date.UTC(y, mo - 1, d);
  const check = new Date(utc);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return utc - IST_OFFSET_MS;
}

/**
 * Resolves a report range. Defaults to the current IST month up to today.
 * Returns an error message for impossible dates, from > to, or ranges over
 * MAX_REPORT_DAYS. Pure (unit-tested).
 */
export function resolveReportRange(from: string | undefined, to: string | undefined, now: Date = new Date()): ReportRange | { error: string } {
  const today = istDateKey(now.getTime());
  const fromKey = from ?? `${today.slice(0, 7)}-01`;
  const toKey = to ?? today;
  const start = istStart(fromKey);
  const toStart = istStart(toKey);
  if (start === null) return { error: '"from" must be a date like 2026-11-01' };
  if (toStart === null) return { error: '"to" must be a date like 2026-11-30' };
  if (toStart < start) return { error: '"from" must be on or before "to"' };
  const days = (toStart - start) / DAY_MS + 1;
  if (days > MAX_REPORT_DAYS) return { error: `A report can cover at most ${MAX_REPORT_DAYS} days` };
  return { from: fromKey, to: toKey, start: new Date(start), end: new Date(toStart + DAY_MS) };
}
