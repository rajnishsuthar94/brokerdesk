/**
 * CSV writing (RFC 4180) with protection against CSV/formula injection:
 * a cell starting with = + - @ (or tab / carriage return) could be executed as a
 * formula by Excel or Google Sheets, so it is prefixed with an apostrophe.
 * Brokers open exports in Excel, and lead data is entered by outsiders.
 */

export type CsvCell = string | number | boolean | null | undefined;

const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  // Phone numbers like +919876543210 are data, not formulas, but Excel would
  // still evaluate them; the apostrophe keeps them as text in every case.
  if (FORMULA_TRIGGER.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Builds a CSV document. Starts with a UTF-8 BOM so Excel shows ₹ and
 * Gujarati/Hindi names correctly; uses CRLF line endings.
 */
export const UTF8_BOM = String.fromCharCode(0xfeff);

export function toCsv(headers: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  const lines = [headers.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))];
  return `${UTF8_BOM}${lines.join('\r\n')}\r\n`;
}
