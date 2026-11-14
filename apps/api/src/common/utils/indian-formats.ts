/**
 * Parsers for values the way Indian brokers write them in spreadsheets.
 * Pure functions, unit-tested.
 */

export { parseIndianAmount } from '@brokerdesk/shared-types';

/** "3", "3 BHK", "3bhk", "3.0" → 3. "1 RK" → 1. Returns null if not 1–20. */
export function parseBhk(input: string): number | null {
  const match = /^(\d{1,2})(?:\.0)?\s*(?:bhk|rk)?$/i.exec(input.trim());
  if (!match) return null;
  const n = Number(match[1]);
  return n >= 1 && n <= 20 ? n : null;
}

/** IST is UTC+05:30 with no daylight saving. */
const IST_OFFSET_MS = 330 * 60 * 1000;

/**
 * Parses a date written as DD/MM/YYYY (or DD-MM-YYYY, DD.MM.YYYY), with an
 * optional "HH:mm" 24-hour time, interpreted in Asia/Kolkata. Also accepts ISO
 * strings. Returns null for invalid dates (e.g. 31/02/2026).
 */
export function parseIndianDate(input: string): Date | null {
  const s = input.trim();
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(s);
  if (m) {
    const [day, month, year, hour, minute] = [m[1], m[2], m[3], m[4] ?? '10', m[5] ?? '00'].map(Number) as [
      number, number, number, number, number,
    ];
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
    const utc = Date.UTC(year, month - 1, day, hour, minute) - IST_OFFSET_MS;
    const check = new Date(utc + IST_OFFSET_MS);
    if (check.getUTCDate() !== day || check.getUTCMonth() !== month - 1) return null; // 31/02
    return new Date(utc);
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Start (inclusive) and end (exclusive) of the IST calendar day containing `now`, as UTC instants. */
export function istDayRange(now: Date): { start: Date; end: Date } {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const startUtc = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS;
  return { start: new Date(startUtc), end: new Date(startUtc + 86_400_000) };
}

/** "20/11/2026, 5:30 PM" in Asia/Kolkata — for human-readable history entries. */
export function formatIstDateTime(date: Date): string {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const pad = (n: number): string => String(n).padStart(2, '0');
  const h = ist.getUTCHours();
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${pad(ist.getUTCDate())}/${pad(ist.getUTCMonth() + 1)}/${ist.getUTCFullYear()}, ${hour12}:${pad(ist.getUTCMinutes())} ${h < 12 ? 'AM' : 'PM'}`;
}

/** First instant (UTC) of the IST calendar month containing `now`, shifted by `offset` months. */
export function istMonthStart(now: Date, offset = 0): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() + offset, 1) - IST_OFFSET_MS);
}

/** "YYYY-MM" of the IST month containing `date`. */
export function istMonthKey(date: Date): string {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}`;
}
