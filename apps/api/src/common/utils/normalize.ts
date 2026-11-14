/** Lower-cases and trims an email address for storage and comparison. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Normalises an Indian mobile number to E.164 (`+919876543210`).
 * Accepts: 9876543210, 09876543210, 919876543210, +91 98765 43210, +91-98765-43210.
 * Returns null when the input is not a valid Indian mobile number
 * (10 digits starting with 6–9).
 */
export function normalizeIndianMobile(input: string): string | null {
  const trimmed = input.trim();
  // Digits, spaces, dashes, brackets and at most one "+" (e.g. "(+91) 98250 12345").
  if (!/^[+\d\s\-()]+$/.test(trimmed) || (trimmed.match(/\+/g)?.length ?? 0) > 1) return null;
  const digits = trimmed.replace(/\D/g, '');
  let national: string;
  if (digits.length === 10) national = digits;
  else if (digits.length === 11 && digits.startsWith('0')) national = digits.slice(1);
  else if (digits.length === 12 && digits.startsWith('91')) national = digits.slice(2);
  else return null;
  return /^[6-9]\d{9}$/.test(national) ? `+91${national}` : null;
}

/**
 * Normalises a buyer's phone number: Indian mobiles become +91XXXXXXXXXX; other
 * international numbers must start with "+" and have 8–15 digits (e.g. NRI buyers).
 * Returns null for anything else.
 */
export function normalizeLeadPhone(input: string): string | null {
  const indian = normalizeIndianMobile(input);
  if (indian) return indian;
  const trimmed = input.trim();
  if (!trimmed.startsWith('+') || !/^\+[\d\s\-()]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.startsWith('91')) return null; // +91 must be a valid Indian mobile
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}

/** Collapses internal whitespace and trims (names, titles). */
export function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}
