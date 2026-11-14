const IST_OFFSET_MS = 330 * 60_000;

export type RangePreset = 'this-month' | 'last-month' | 'last-3-months' | 'this-fy' | 'last-fy';

export interface DateRange {
  /** "YYYY-MM-DD" (IST, inclusive). */
  readonly from: string;
  readonly to: string;
}

export const PRESET_LABELS: Readonly<Record<RangePreset, string>> = {
  'this-month': 'This month',
  'last-month': 'Last month',
  'last-3-months': 'Last 3 months',
  'this-fy': 'This financial year',
  'last-fy': 'Last financial year',
};

const pad = (n: number): string => String(n).padStart(2, '0');
const key = (y: number, m: number, d: number): string => `${y}-${pad(m)}-${pad(d)}`;
/** Last day of month `m` (1-12) of year `y`. */
const lastDay = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Today's IST calendar date parts. */
function istToday(now: Date): { y: number; m: number; d: number } {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return { y: ist.getUTCFullYear(), m: ist.getUTCMonth() + 1, d: ist.getUTCDate() };
}

/**
 * Date ranges in IST. Financial years run April–March (Indian FY);
 * ranges that include today end today.
 */
export function presetRange(preset: RangePreset, now: Date = new Date()): DateRange {
  const { y, m, d } = istToday(now);
  const today = key(y, m, d);
  switch (preset) {
    case 'this-month':
      return { from: key(y, m, 1), to: today };
    case 'last-month': {
      const [ly, lm] = m === 1 ? [y - 1, 12] : [y, m - 1];
      return { from: key(ly, lm, 1), to: key(ly, lm, lastDay(ly, lm)) };
    }
    case 'last-3-months': {
      const start = new Date(Date.UTC(y, m - 1 - 2, 1));
      return { from: key(start.getUTCFullYear(), start.getUTCMonth() + 1, 1), to: today };
    }
    case 'this-fy': {
      const fyStart = m >= 4 ? y : y - 1;
      return { from: key(fyStart, 4, 1), to: today };
    }
    case 'last-fy': {
      const fyStart = (m >= 4 ? y : y - 1) - 1;
      return { from: key(fyStart, 4, 1), to: key(fyStart + 1, 3, 31) };
    }
  }
}

/** "FY 2026-27" for a date in that financial year. */
export function fyLabel(date: string): string {
  const [y, m] = date.split('-').map(Number) as [number, number];
  const start = m >= 4 ? y : y - 1;
  return `FY ${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** "01/11/2026" from "2026-11-01". */
export function displayDate(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}
