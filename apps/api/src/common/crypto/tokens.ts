import { createHash, randomBytes } from 'node:crypto';

/**
 * Opaque, URL-safe random token (256 bits). Used for refresh tokens, password
 * reset links and invitations. Only `hashToken(token)` is ever stored.
 */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * SHA-256 hex digest of a high-entropy token. A plain (unsalted, fast) hash is
 * appropriate here because the input is 256 random bits, not a password: it cannot
 * be brute-forced, and a deterministic hash allows indexed lookup.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

