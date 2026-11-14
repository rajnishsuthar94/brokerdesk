import { closedAtFor } from '../follow-ups/follow-up-sync.js';
import { formatIstDateTime, istMonthKey, istMonthStart } from '../common/utils/indian-formats.js';
import { bucketByMonth, lastMonths } from './dashboard.service.js';

describe('IST months', () => {
  it('a timestamp late on the last UTC day of a month belongs to the next IST month', () => {
    expect(istMonthKey(new Date('2026-10-31T20:00:00Z'))).toBe('2026-11'); // 01:30 IST on 1 Nov
    expect(istMonthStart(new Date('2026-11-15T06:00:00Z')).toISOString()).toBe('2026-10-31T18:30:00.000Z');
  });

  it('lists the last 6 months oldest first, across a year boundary', () => {
    expect(lastMonths(new Date('2027-02-10T06:00:00Z'))).toEqual(['2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02']);
  });

  it('buckets dates into IST months and ignores dates outside the window', () => {
    const months = ['2026-10', '2026-11'];
    const dates = ['2026-10-05T10:00:00Z', '2026-10-31T19:00:00Z', '2026-11-02T10:00:00Z', '2025-01-01T00:00:00Z'].map((d) => new Date(d));
    expect(bucketByMonth(dates, months)).toEqual([
      { month: '2026-10', count: 1 },
      { month: '2026-11', count: 2 },
    ]);
  });
});

describe('closedAtFor', () => {
  const now = new Date('2026-11-15T06:00:00Z');
  it.each([
    ['NEW → WON sets the close time', 'WON', 'NEW', now],
    ['WON → LOST resets it', 'LOST', 'WON', now],
    ['WON → NEGOTIATION (reopened) clears it', 'NEGOTIATION', 'WON', null],
    ['NEW → CONTACTED leaves it alone', 'CONTACTED', 'NEW', undefined],
    ['no change leaves it alone', 'WON', 'WON', undefined],
    ['created as WON', 'WON', null, now],
  ] as const)('%s', (_label, next, previous, expected) => {
    expect(closedAtFor(next, previous, now)).toEqual(expected);
  });
});

describe('formatIstDateTime', () => {
  it.each([
    ['2026-11-20T12:00:00Z', '20/11/2026, 5:30 PM'],
    ['2026-11-19T18:30:00Z', '20/11/2026, 12:00 AM'],
    ['2026-11-20T06:30:00Z', '20/11/2026, 12:00 PM'],
  ])('%s → %s', (iso, expected) => {
    expect(formatIstDateTime(new Date(iso))).toBe(expected);
  });
});
