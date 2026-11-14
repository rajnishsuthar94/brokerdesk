import type { Request } from 'express';

export interface RequestMeta {
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

/**
 * Client IP and user agent for audit logs and refresh-token records.
 * `req.ip` honours the `trust proxy` setting (TRUST_PROXY_HOPS), so spoofed
 * X-Forwarded-For headers are ignored unless a trusted proxy is configured.
 */
export function requestMeta(req: Request): RequestMeta {
  const ua = req.get('user-agent');
  return {
    ipAddress: req.ip ? req.ip.slice(0, 45) : null,
    userAgent: ua ? ua.slice(0, 255) : null,
  };
}
