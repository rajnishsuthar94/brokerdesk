import { resolveReportRange } from './report-range.js';

describe('resolveReportRange', () => {
  const now = new Date('2026-11-14T20:00:00Z'); // 15 Nov 2026, 01:30 IST

  it('defaults to the current IST month up to today', () => {
    expect(resolveReportRange(undefined, undefined, now)).toEqual({
      from: '2026-11-01',
      to: '2026-11-15',
      start: new Date('2026-10-31T18:30:00.000Z'),
      end: new Date('2026-11-15T18:30:00.000Z'),
    });
  });

  it('covers whole IST days, both ends inclusive', () => {
    const r = resolveReportRange('2026-04-01', '2027-03-31', now);
    expect(r).toMatchObject({ start: new Date('2026-03-31T18:30:00.000Z'), end: new Date('2027-03-31T18:30:00.000Z') });
  });

  it.each([
    ['2026-02-30', '2026-03-01', 'from'],
    ['2026-11-01', '15/11/2026', 'to'],
    ['2026-11-10', '2026-11-01', 'on or before'],
    ['2025-01-01', '2026-11-01', 'at most 366 days'],
  ])('rejects %s → %s', (from, to, message) => {
    const r = resolveReportRange(from, to, now);
    expect('error' in r && r.error).toContain(message);
  });
});
