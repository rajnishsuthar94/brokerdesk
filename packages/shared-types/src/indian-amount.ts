/**
 * Parses INR amounts the way Indian brokers write them. Shared by the API (CSV
 * import) and the web app (budget fields), so both accept exactly the same input.
 */
const LAKH = 1_00_000;
const CRORE = 1_00_00_000;

/**
 * Parses an INR amount: "8500000", "85,00,000", "₹ 85,00,000", "85L", "85 lakh",
 * "85 lac", "1.2 Cr", "1.2 crore", "25k", "25 thousand". Returns rupees or null.
 */
export function parseIndianAmount(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/₹|rs\.?|inr|\/-/g, '').replace(/,/g, '').trim();
  if (s === '') return null;
  const match = /^(\d+(?:\.\d+)?)\s*([a-z]*)\.?$/.exec(s);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2] ?? '';
  let multiplier: number;
  if (unit === '') multiplier = 1;
  else if (['l', 'lac', 'lacs', 'lakh', 'lakhs'].includes(unit)) multiplier = LAKH;
  else if (['cr', 'crs', 'crore', 'crores'].includes(unit)) multiplier = CRORE;
  else if (['k', 'thousand'].includes(unit)) multiplier = 1000;
  else return null;
  const rupees = Math.round(value * multiplier * 100) / 100;
  return Number.isFinite(rupees) ? rupees : null;
}

/**
 * Short INR text the way brokers say it: ₹85 L, ₹1.2 Cr, ₹28,000.
 * Used in plain-language explanations (e.g. match details).
 */
export function formatInrShort(rupees: number): string {
  const abs = Math.abs(rupees);
  const sign = rupees < 0 ? '-' : '';
  const trim = (n: number): string => String(Math.round(n * 100) / 100);
  if (abs >= CRORE) return `${sign}₹${trim(abs / CRORE)} Cr`;
  if (abs >= LAKH) return `${sign}₹${trim(abs / LAKH)} L`;
  return `${sign}₹${Math.round(abs).toLocaleString('en-IN')}`;
}
