import { BadRequestException } from '@nestjs/common';
import { unzipSync } from 'fflate';
import { readSheet } from 'read-excel-file/node';

/**
 * Reading uploaded spreadsheets (.xlsx) safely.
 *
 * An .xlsx file is a ZIP archive and the parser unpacks it in memory, so a tiny
 * malicious file could expand to gigabytes ("zip bomb"). Before parsing we read
 * only the ZIP's central directory (no decompression) and refuse archives that
 * declare more than MAX_UNCOMPRESSED_BYTES or MAX_ENTRIES. This is on top of the
 * 1 MB upload limit and the import being restricted to owners/admins.
 */
export const XLSX_LIMITS = {
  /** A 2,000-row lead sheet unpacks to well under 5 MB. */
  maxUncompressedBytes: 20 * 1024 * 1024,
  maxEntries: 200,
} as const;

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04"
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0]; // legacy .xls (Excel 97–2003)

function startsWith(buf: Uint8Array, magic: readonly number[]): boolean {
  return magic.every((b, i) => buf[i] === b);
}

export type SpreadsheetKind = 'xlsx' | 'xls' | 'text';

/** Detects the real file type from its first bytes (never trust the file name alone). */
export function detectSpreadsheet(buf: Uint8Array): SpreadsheetKind {
  if (startsWith(buf, ZIP_MAGIC)) return 'xlsx';
  if (startsWith(buf, OLE_MAGIC)) return 'xls';
  return 'text';
}

function assertSafeZip(buf: Uint8Array): void {
  let total = 0;
  let entries = 0;
  try {
    // `filter` sees each entry's declared sizes; returning false skips decompression.
    unzipSync(buf, {
      filter: (file) => {
        entries += 1;
        total += file.originalSize;
        return false;
      },
    });
  } catch {
    throw new BadRequestException('Could not read this Excel file. Open it in Excel and save it again as .xlsx.');
  }
  if (entries > XLSX_LIMITS.maxEntries || total > XLSX_LIMITS.maxUncompressedBytes) {
    throw new BadRequestException('This Excel file is too large or unusual to import. Save it as CSV and try again.');
  }
}

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * Cell → text, so Excel rows go through exactly the same parsing as CSV rows.
 * Excel dates are wall-clock values (read as UTC midnight / UTC time), so they are
 * written back as "DD/MM/YYYY[ HH:mm]" from their UTC parts and later read as IST.
 */
export function cellToText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    const date = `${pad(value.getUTCDate())}/${pad(value.getUTCMonth() + 1)}/${value.getUTCFullYear()}`;
    const hasTime = value.getUTCHours() !== 0 || value.getUTCMinutes() !== 0;
    return hasTime ? `${date} ${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}` : date;
  }
  if (typeof value === 'number') {
    // Avoid "9.82507e+9" for phone numbers stored as numbers.
    return Number.isInteger(value) ? value.toFixed(0) : String(value);
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return typeof value === 'string' ? value : '';
}

/** First worksheet of an .xlsx file as rows of text cells. */
export async function readXlsxRows(buf: Buffer): Promise<string[][]> {
  assertSafeZip(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
  let rows: unknown[][];
  try {
    rows = (await readSheet(buf)) as unknown[][];
  } catch {
    throw new BadRequestException('Could not read this Excel file. Open it in Excel and save it again as .xlsx.');
  }
  return rows.map((row) => row.map(cellToText));
}
