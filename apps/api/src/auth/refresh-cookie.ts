import { BadRequestException } from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { API_DEFAULT_VERSION, API_PREFIX } from '../setup-app.js';

export const REFRESH_COOKIE = 'bd_rt';

/**
 * Cookie-authenticated endpoints (refresh, logout) also require this header.
 * Browsers cannot attach custom headers to cross-site form posts, so together
 * with SameSite=Strict it is defence-in-depth against CSRF.
 */
export const CLIENT_HEADER = 'x-brokerdesk-client';

/** Scoped to the auth routes so the refresh token is never sent anywhere else. */
const COOKIE_PATH = `/${API_PREFIX}/v${API_DEFAULT_VERSION}/auth`;

function baseOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, secure, sameSite: 'strict', path: COOKIE_PATH };
}

export function setRefreshCookie(res: Response, token: string, expiresAt: Date, secure: boolean): void {
  res.cookie(REFRESH_COOKIE, token, { ...baseOptions(secure), expires: expiresAt });
}

export function clearRefreshCookie(res: Response, secure: boolean): void {
  res.clearCookie(REFRESH_COOKIE, baseOptions(secure));
}

export function readRefreshCookie(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function assertClientHeader(req: Request): void {
  if (!req.get(CLIENT_HEADER)) {
    throw new BadRequestException(`Missing ${CLIENT_HEADER} header`);
  }
}
