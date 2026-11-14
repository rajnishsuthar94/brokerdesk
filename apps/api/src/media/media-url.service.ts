import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppConfigService } from '../config/app-config.service.js';
import { API_DEFAULT_VERSION, API_PREFIX } from '../setup-app.js';

/**
 * Signed, expiring URLs for private media (property images).
 *
 * An <img> tag cannot send the Bearer token, so the API embeds a signature in
 * the URL instead: HMAC-SHA256 over "key:expiry". Only someone who received the
 * URL from an authenticated, tenant-checked API response can load the image, and
 * only until it expires.
 *
 * Expiry is rounded up to fixed windows so the same image keeps the same URL for
 * a while (browser-cacheable); a URL is valid for between 1 and 2 TTLs.
 */
@Injectable()
export class MediaUrlService {
  private readonly key: Buffer;
  private readonly ttl: number;

  constructor(config: AppConfigService) {
    // Derived key: rotating JWT_ACCESS_SECRET also invalidates all media URLs.
    this.key = createHmac('sha256', config.get('JWT_ACCESS_SECRET')).update('brokerdesk:media-url:v1').digest();
    this.ttl = config.get('MEDIA_URL_TTL_SECONDS');
  }

  private signature(storageKey: string, exp: number): string {
    return createHmac('sha256', this.key).update(`${storageKey}:${exp}`).digest('base64url');
  }

  /** Same-origin relative URL, e.g. /api/v1/media/<a>/<b>/<c>.webp?exp=…&sig=… */
  sign(storageKey: string, nowMs = Date.now()): string {
    const now = Math.floor(nowMs / 1000);
    const exp = (Math.floor(now / this.ttl) + 2) * this.ttl;
    return `/${API_PREFIX}/v${API_DEFAULT_VERSION}/media/${storageKey}?exp=${exp}&sig=${this.signature(storageKey, exp)}`;
  }

  /** Seconds the URL remains valid, or null if the signature is wrong or expired. */
  verify(storageKey: string, exp: string, sig: string, nowMs = Date.now()): number | null {
    if (!/^\d{1,12}$/.test(exp)) return null;
    const expiry = Number(exp);
    const remaining = expiry - Math.floor(nowMs / 1000);
    if (remaining <= 0) return null;
    const expected = Buffer.from(this.signature(storageKey, expiry));
    const given = Buffer.from(sig);
    return expected.length === given.length && timingSafeEqual(expected, given) ? remaining : null;
  }
}
