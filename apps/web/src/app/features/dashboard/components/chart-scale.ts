/**
 * A "nice" linear axis for counts: 0 … max in at most `maxTicks` clean steps
 * (1, 2, 5 × 10^k; never fractional for counts).
 */
export function niceScale(maxValue: number, maxTicks = 4): { max: number; ticks: number[] } {
  if (!Number.isFinite(maxValue) || maxValue <= 0) return { max: 1, ticks: [0, 1] };
  const raw = maxValue / maxTicks;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? 10 * magnitude);
  const max = Math.ceil(maxValue / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  return { max, ticks };
}

/** Axis tick text: in full under 10,000, compact above (10K, 1.5L…) in Indian style. */
export function formatTick(value: number): string {
  if (value < 10_000) return value.toLocaleString('en-IN');
  if (value < 1_00_000) return `${Math.round(value / 1000)}K`;
  return `${(value / 1_00_000).toFixed(value % 1_00_000 === 0 ? 0 : 1)}L`;
}

/** "2026-11" → "Nov" and "November 2026". */
export function monthLabels(key: string): { short: string; long: string } {
  const [y, m] = key.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1, 1));
  return {
    short: d.toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' }),
    long: d.toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
  };
}
