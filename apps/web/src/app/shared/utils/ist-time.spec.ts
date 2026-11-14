import { istStartOfDay, relativeIstDateTime, timePresets } from './ist-time';

describe('IST time helpers', () => {
  it('start of the IST day, also just after midnight IST (still the previous UTC day)', () => {
    expect(new Date(istStartOfDay(new Date('2026-11-15T06:00:00Z'))).toISOString()).toBe('2026-11-14T18:30:00.000Z');
    expect(new Date(istStartOfDay(new Date('2026-11-14T19:00:00Z'))).toISOString()).toBe('2026-11-14T18:30:00.000Z');
  });

  it('offers "Today 6 PM" only while it is still ahead', () => {
    const morning = timePresets(new Date('2026-11-15T04:30:00Z')); // 10:00 IST
    expect(morning.map((p) => p.label)).toEqual(['Today 6 PM', 'Tomorrow 11 AM', 'In 3 days', 'Next week']);
    expect(morning[0]!.value).toBe('2026-11-15T18:00');
    expect(morning[1]!.value).toBe('2026-11-16T11:00');

    const evening = timePresets(new Date('2026-11-15T12:15:00Z')); // 17:45 IST
    expect(evening[0]!.label).toBe('Tomorrow 11 AM');
  });

  it('describes times relative to the IST day', () => {
    const now = new Date('2026-11-15T04:30:00Z'); // Sun 15 Nov, 10:00 IST
    expect(relativeIstDateTime('2026-11-15T12:00:00Z', now)).toBe('Today, 5:30 PM');
    expect(relativeIstDateTime('2026-11-16T05:30:00Z', now)).toBe('Tomorrow, 11:00 AM');
    expect(relativeIstDateTime('2026-11-14T05:30:00Z', now)).toBe('Yesterday, 11:00 AM');
    expect(relativeIstDateTime('2026-11-23T05:30:00Z', now)).toBe('Mon, 23 Nov, 11:00 AM');
  });
});
