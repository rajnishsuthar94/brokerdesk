import { csvCell, toCsv } from './csv.js';
import { istDayRange, parseBhk, parseIndianAmount, parseIndianDate } from './indian-formats.js';
import { normalizeLeadPhone } from './normalize.js';

describe('parseIndianAmount', () => {
  it.each([
    ['8500000', 8_500_000],
    ['85,00,000', 8_500_000],
    ['₹ 85,00,000', 8_500_000],
    ['Rs. 85,00,000/-', 8_500_000],
    ['85L', 8_500_000],
    ['85 lakh', 8_500_000],
    ['85 Lac', 8_500_000],
    ['1.2 Cr', 12_000_000],
    ['2.45 crore', 24_500_000],
    ['25k', 25_000],
    ['28000', 28_000],
  ])('%s → %d', (input, expected) => {
    expect(parseIndianAmount(input)).toBe(expected);
  });

  it.each(['', 'abc', '85 million', '1.2.3', '-5'])('rejects %j', (input) => {
    expect(parseIndianAmount(input)).toBeNull();
  });
});

describe('parseBhk', () => {
  it.each([
    ['3', 3],
    ['3 BHK', 3],
    ['2bhk', 2],
    ['1 RK', 1],
    ['4.0', 4],
  ])('%s → %d', (input, expected) => {
    expect(parseBhk(input)).toBe(expected);
  });

  it.each(['0', '25', 'three', '2.5'])('rejects %s', (input) => {
    expect(parseBhk(input)).toBeNull();
  });
});

describe('parseIndianDate (Asia/Kolkata)', () => {
  it('reads DD/MM/YYYY as 10:00 IST by default', () => {
    expect(parseIndianDate('15/11/2026')?.toISOString()).toBe('2026-11-15T04:30:00.000Z');
  });

  it('accepts dashes, dots and a 24h time', () => {
    expect(parseIndianDate('05-01-2027 17:30')?.toISOString()).toBe('2027-01-05T12:00:00.000Z');
    expect(parseIndianDate('5.1.2027')?.toISOString()).toBe('2027-01-05T04:30:00.000Z');
  });

  it('accepts ISO strings', () => {
    expect(parseIndianDate('2026-11-15T04:30:00.000Z')?.toISOString()).toBe('2026-11-15T04:30:00.000Z');
  });

  it.each(['31/02/2026', '15/13/2026', '11/15/2026', 'tomorrow', '15/11/26'])('rejects %s', (input) => {
    expect(parseIndianDate(input)).toBeNull();
  });
});

describe('istDayRange', () => {
  it('uses the IST calendar day, not the UTC one', () => {
    // 20:00 UTC on the 14th is 01:30 IST on the 15th.
    const { start, end } = istDayRange(new Date('2026-11-14T20:00:00Z'));
    expect(start.toISOString()).toBe('2026-11-14T18:30:00.000Z');
    expect(end.toISOString()).toBe('2026-11-15T18:30:00.000Z');
  });
});

describe('normalizeLeadPhone', () => {
  it.each([
    ['98250 12345', '+919825012345'],
    ['+1 (415) 555-0123', '+14155550123'],
    ['+44 7911 123456', '+447911123456'],
    ['+971 50 123 4567', '+971501234567'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeLeadPhone(input)).toBe(expected);
  });

  it.each(['12345', '+91 12345 67890', '+1 234', '4155550123', 'call me'])('rejects %s', (input) => {
    expect(normalizeLeadPhone(input)).toBeNull();
  });
});

describe('CSV export', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('Mehta, Amit')).toBe('"Mehta, Amit"');
    expect(csvCell('6" pipe')).toBe('"6"" pipe"');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(8500000)).toBe('8500000');
  });

  it.each(['=HYPERLINK("http://evil")', '+919825012345', '-2+3', '@SUM(A1)', '\t=1'])(
    'neutralises formula injection in %j',
    (value) => {
      expect(csvCell(value).replace(/^"/, '').startsWith("'")).toBe(true);
    },
  );

  it('starts with a BOM and uses CRLF', () => {
    expect(toCsv(['Name', 'City'], [['Amit', 'Ahmedabad']])).toBe('﻿Name,City\r\nAmit,Ahmedabad\r\n');
  });
});
