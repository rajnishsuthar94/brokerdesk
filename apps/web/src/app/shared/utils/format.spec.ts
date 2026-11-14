import { formatDate, formatDateTime, formatIndianPhone, formatInr, fromIstInputValue, toIstInputValue } from './format';

describe('formatInr', () => {
  it('uses Indian digit grouping', () => {
    expect(formatInr(8500000)).toBe('₹85,00,000');
    expect(formatInr(1234567)).toBe('₹12,34,567');
  });

  it('accepts Decimal strings from the API', () => {
    expect(formatInr('24500000.00')).toBe('₹2,45,00,000');
  });

  it('formats lakh and crore short forms', () => {
    expect(formatInr(8500000, 'short')).toBe('₹85 L');
    expect(formatInr(24500000, 'short')).toBe('₹2.45 Cr');
    expect(formatInr(100000, 'short')).toBe('₹1 L');
    expect(formatInr(28000, 'short')).toBe('₹28,000');
  });

  it('returns empty string for missing or invalid values', () => {
    expect(formatInr(null)).toBe('');
    expect(formatInr(undefined)).toBe('');
    expect(formatInr('abc')).toBe('');
  });
});

describe('formatDate / formatDateTime (Asia/Kolkata)', () => {
  it('formats as DD/MM/YYYY in IST', () => {
    expect(formatDate('2026-11-14T10:00:00Z')).toBe('14/11/2026');
  });

  it('rolls over to the next IST day for late-evening UTC times', () => {
    // 20:00 UTC = 01:30 IST next day
    expect(formatDate('2026-11-14T20:00:00Z')).toBe('15/11/2026');
  });

  it('formats date and 12-hour time in IST', () => {
    expect(formatDateTime('2026-11-14T11:30:00Z')).toBe('14/11/2026, 5:00 PM');
    expect(formatDateTime('2026-11-13T18:30:00Z')).toBe('14/11/2026, 12:00 AM');
  });

  it('returns empty string for invalid input', () => {
    expect(formatDate('not-a-date')).toBe('');
    expect(formatDateTime(null)).toBe('');
  });
});

describe('formatIndianPhone', () => {
  it.each([
    ['+919825012345', '+91 98250 12345'],
    ['919825012345', '+91 98250 12345'],
    ['98250 12345', '+91 98250 12345'],
  ])('formats %s', (input, expected) => {
    expect(formatIndianPhone(input)).toBe(expected);
  });

  it('leaves non-mobile numbers untouched', () => {
    expect(formatIndianPhone('+44 20 7946 0958')).toBe('+44 20 7946 0958');
    // Ahmedabad landline with STD code — must not be mistaken for a mobile number.
    expect(formatIndianPhone(' 079-26501234 ')).toBe('079-26501234');
    expect(formatIndianPhone('07926501234')).toBe('07926501234');
  });
});

describe('IST datetime-local helpers', () => {
  it('shows an instant as IST wall-clock time', () => {
    expect(toIstInputValue('2026-11-20T12:00:00.000Z')).toBe('2026-11-20T17:30');
    expect(toIstInputValue(null)).toBe('');
  });

  it('reads the input as IST, whatever the device timezone', () => {
    expect(fromIstInputValue('2026-11-20T17:30')).toBe('2026-11-20T12:00:00.000Z');
    expect(fromIstInputValue('2026-11-21T00:15')).toBe('2026-11-20T18:45:00.000Z');
    expect(fromIstInputValue('')).toBeNull();
  });
});
