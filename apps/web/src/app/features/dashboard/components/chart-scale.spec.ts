import { formatTick, monthLabels, niceScale } from './chart-scale';

describe('chart scale', () => {
  it.each([
    [0, 1, [0, 1]],
    [3, 3, [0, 1, 2, 3]],
    [7, 8, [0, 2, 4, 6, 8]],
    [37, 40, [0, 10, 20, 30, 40]],
    [120, 150, [0, 50, 100, 150]],
  ])('max %s → axis to %s', (value, max, ticks) => {
    expect(niceScale(value)).toEqual({ max, ticks });
  });

  it('formats ticks in full under 10,000 and compact (Indian) above', () => {
    expect(formatTick(2000)).toBe('2,000');
    expect(formatTick(20000)).toBe('20K');
    expect(formatTick(150000)).toBe('1.5L');
  });

  it('labels months', () => {
    expect(monthLabels('2026-11')).toEqual({ short: 'Nov', long: 'November 2026' });
  });
});
