/** IST is UTC+05:30 all year (no daylight saving). */
const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

export interface TimePreset {
  readonly label: string;
  /** Value for <input type="datetime-local"> in IST wall-clock time. */
  readonly value: string;
}

/** IST wall-clock "YYYY-MM-DDTHH:mm" for an instant. */
function istInput(ms: number): string {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 16);
}

/** Start of the IST calendar day containing `now`, as epoch ms (UTC). */
export function istStartOfDay(now: Date): number {
  const ist = now.getTime() + IST_OFFSET_MS;
  return ist - (ist % DAY_MS) - IST_OFFSET_MS;
}

/**
 * Quick picks for follow-up / visit times, in IST:
 * "Today 6 PM" (only while still ahead), "Tomorrow 11 AM", "In 3 days", "Next week".
 */
export function timePresets(now: Date = new Date()): TimePreset[] {
  const day = istStartOfDay(now);
  const at = (days: number, hour: number): number => day + days * DAY_MS + hour * 3_600_000;
  const presets: TimePreset[] = [];
  if (at(0, 18) > now.getTime() + 30 * 60_000) presets.push({ label: 'Today 6 PM', value: istInput(at(0, 18)) });
  presets.push(
    { label: 'Tomorrow 11 AM', value: istInput(at(1, 11)) },
    { label: 'In 3 days', value: istInput(at(3, 11)) },
    { label: 'Next week', value: istInput(at(7, 11)) },
  );
  return presets;
}

/** "Today, 5:30 PM" / "Tomorrow, 11:00 AM" / "Mon, 23 Nov, 11:00 AM" — relative day in IST. */
export function relativeIstDateTime(iso: string, now: Date = new Date()): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  const time = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true })
    .format(t)
    .toUpperCase();
  const diffDays = Math.floor((istStartOfDay(t) - istStartOfDay(now)) / DAY_MS);
  if (diffDays === 0) return `Today, ${time}`;
  if (diffDays === 1) return `Tomorrow, ${time}`;
  if (diffDays === -1) return `Yesterday, ${time}`;
  const date = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' }).format(t);
  return `${date}, ${time}`;
}
