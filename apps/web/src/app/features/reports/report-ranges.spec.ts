import { displayDate, fyLabel, presetRange } from './report-ranges';

describe('report ranges (IST, Indian financial year)', () => {
  const now = new Date('2026-11-14T20:00:00Z'); // Sun 15 Nov 2026, 01:30 IST

  it.each([
    ['this-month', '2026-11-01', '2026-11-15'],
    ['last-month', '2026-10-01', '2026-10-31'],
    ['last-3-months', '2026-09-01', '2026-11-15'],
    ['this-fy', '2026-04-01', '2026-11-15'],
    ['last-fy', '2025-04-01', '2026-03-31'],
  ] as const)('%s → %s … %s', (preset, from, to) => {
    expect(presetRange(preset, now)).toEqual({ from, to });
  });

  it('handles January (last month is December, FY started last April)', () => {
    const jan = new Date('2027-01-10T06:00:00Z');
    expect(presetRange('last-month', jan)).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    expect(presetRange('this-fy', jan).from).toBe('2026-04-01');
    expect(presetRange('last-3-months', jan).from).toBe('2026-11-01');
  });

  it('handles February in a leap year', () => {
    expect(presetRange('last-month', new Date('2028-03-05T06:00:00Z'))).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('labels financial years and dates', () => {
    expect(fyLabel('2026-11-15')).toBe('FY 2026-27');
    expect(fyLabel('2027-03-31')).toBe('FY 2026-27');
    expect(fyLabel('2099-04-01')).toBe('FY 2099-00');
    expect(displayDate('2026-11-01')).toBe('01/11/2026');
  });
});
