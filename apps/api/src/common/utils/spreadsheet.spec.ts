import { BadRequestException } from '@nestjs/common';
import { zipSync } from 'fflate';
import writeExcelFile from 'write-excel-file/node';
import { XLSX_LIMITS, cellToText, detectSpreadsheet, readXlsxRows } from './spreadsheet.js';

describe('cellToText', () => {
  it.each([
    [null, ''],
    [undefined, ''],
    ['  Amit ', '  Amit '],
    [9825070001, '9825070001'],
    [919825070001, '919825070001'],
    [8500000, '8500000'],
    [1.5, '1.5'],
    [true, 'TRUE'],
    [new Date(Date.UTC(2026, 10, 20)), '20/11/2026'],
    [new Date(Date.UTC(2026, 10, 20, 17, 30)), '20/11/2026 17:30'],
  ])('%j → %j', (input, expected) => {
    expect(cellToText(input)).toBe(expected);
  });
});

describe('detectSpreadsheet', () => {
  it('uses the file content, not the name', () => {
    expect(detectSpreadsheet(Buffer.from('PK\x03\x04rest', 'latin1'))).toBe('xlsx');
    expect(detectSpreadsheet(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1]))).toBe('xls');
    expect(detectSpreadsheet(Buffer.from('Name,Phone\n'))).toBe('text');
  });
});

describe('readXlsxRows', () => {
  it('reads the first sheet as text cells (numbers, dates, blanks)', async () => {
    const buf = await writeExcelFile([
      ['Name', 'Mobile', 'Budget', 'Next Follow-up'],
      ['Kiran Joshi', 9825070001, '85 L', { value: new Date(Date.UTC(2026, 10, 20)), type: Date, format: 'dd/mm/yyyy' }],
      ['Meera', '+91 98250 70002', 12000000, null],
    ]).toBuffer();
    expect(await readXlsxRows(buf)).toEqual([
      ['Name', 'Mobile', 'Budget', 'Next Follow-up'],
      ['Kiran Joshi', '9825070001', '85 L', '20/11/2026'],
      ['Meera', '+91 98250 70002', '12000000', ''],
    ]);
  });

  it('refuses a zip bomb before unpacking it', async () => {
    // 30 MB of zeros compresses to a few KB: small upload, huge in memory.
    const bomb = Buffer.from(zipSync({ 'xl/worksheets/sheet1.xml': new Uint8Array(30 * 1024 * 1024) }, { level: 9 }));
    expect(bomb.length).toBeLessThan(100 * 1024);
    expect(30 * 1024 * 1024).toBeGreaterThan(XLSX_LIMITS.maxUncompressedBytes);
    await expect(readXlsxRows(bomb)).rejects.toThrow(/too large or unusual/);
  });

  it('refuses archives with an unusual number of entries', async () => {
    const files: Record<string, Uint8Array> = {};
    for (let i = 0; i <= XLSX_LIMITS.maxEntries; i++) files[`f${i}.xml`] = new Uint8Array(1);
    await expect(readXlsxRows(Buffer.from(zipSync(files)))).rejects.toThrow(/too large or unusual/);
  });

  it('gives a friendly error for corrupt files', async () => {
    await expect(readXlsxRows(Buffer.from('PK\x03\x04 definitely not a real zip', 'latin1'))).rejects.toBeInstanceOf(BadRequestException);
  });
});
