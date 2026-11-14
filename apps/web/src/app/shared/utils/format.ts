/**
 * India-specific display formatting.
 * - Currency: INR with Indian digit grouping (₹12,34,567) or lakh/crore short form.
 * - Dates: DD/MM/YYYY in the Asia/Kolkata timezone, regardless of device timezone.
 * - Phones: +91 98765 43210.
 *
 * Pure functions (no Angular), so they are trivially unit-testable and reusable
 * from pipes, stores and CSV export.
 */

export const APP_TIME_ZONE = 'Asia/Kolkata';
export const APP_LOCALE = 'en-IN';

const LAKH = 1_00_000;
const CRORE = 1_00_00_000;

type Amount = number | string | null | undefined;

function toNumber(value: Amount): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

const inrFull = new Intl.NumberFormat(APP_LOCALE, {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const shortNumber = new Intl.NumberFormat(APP_LOCALE, { maximumFractionDigits: 2 });

/**
 * Formats an INR amount.
 * `full`  → ₹85,00,000
 * `short` → ₹85 L / ₹2.45 Cr (how brokers quote prices); below 1 lakh falls back to full.
 * Accepts Prisma Decimal values serialised as strings.
 */
export function formatInr(value: Amount, style: 'full' | 'short' = 'full'): string {
  const n = toNumber(value);
  if (n === null) return '';
  if (style === 'short') {
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= CRORE) return `${sign}₹${shortNumber.format(abs / CRORE)} Cr`;
    if (abs >= LAKH) return `${sign}₹${shortNumber.format(abs / LAKH)} L`;
  }
  return inrFull.format(n);
}

type DateInput = Date | string | number | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const dateParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: APP_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const timeParts = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((p) => p.type === type)?.value ?? '';
}

/** DD/MM/YYYY in IST. */
export function formatDate(value: DateInput): string {
  const d = toDate(value);
  if (!d) return '';
  const p = dateParts.formatToParts(d);
  return `${part(p, 'day')}/${part(p, 'month')}/${part(p, 'year')}`;
}

/** DD/MM/YYYY, h:mm AM/PM in IST. */
export function formatDateTime(value: DateInput): string {
  const d = toDate(value);
  if (!d) return '';
  const t = timeParts.formatToParts(d);
  return `${formatDate(d)}, ${part(t, 'hour')}:${part(t, 'minute')} ${part(t, 'dayPeriod').toUpperCase()}`;
}

/**
 * Formats an Indian mobile number for display: +91 98765 43210.
 * Only unambiguous inputs are reformatted (10 digits, or 12 digits with the 91 country
 * code). A 0-prefixed 11-digit number may be a landline with an STD code
 * (e.g. Ahmedabad 079-26501234), so it is returned as typed. Strict validation and
 * E.164 normalisation happen on input (lead/contact forms), not here.
 */
export function formatIndianPhone(value: string | null | undefined): string {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  const national = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  if (national.length === 10 && /^[6-9]/.test(national)) {
    return `+91 ${national.slice(0, 5)} ${national.slice(5)}`;
  }
  return value.trim();
}

/** IST is UTC+05:30 all year (no daylight saving). */
const IST_OFFSET_MS = 330 * 60 * 1000;

/**
 * ISO instant → value for <input type="datetime-local"> showing IST wall-clock
 * time, regardless of the device's timezone.
 */
export function toIstInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 16);
}

/** Value of <input type="datetime-local"> interpreted as IST → ISO instant (UTC). */
export function fromIstInputValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  return new Date(Date.UTC(y, mo - 1, d, h, mi) - IST_OFFSET_MS).toISOString();
}
