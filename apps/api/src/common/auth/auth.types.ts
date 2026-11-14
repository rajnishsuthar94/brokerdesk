import type { MemberRole } from '../../generated/prisma/enums.js';

/** Claims carried by a BrokerDesk access token (JWT, HS256). */
export interface AccessTokenClaims {
  /** User id. */
  readonly sub: string;
  /**
   * Agency the session is currently working in, or null when the user has no
   * agency yet. A *hint* only: membership and role are re-verified against the
   * database on every request, so a removed member loses access immediately.
   */
  readonly aid: string | null;
  readonly typ: 'access';
}

/** Authenticated user, attached to the request by AccessGuard. */
export interface AuthPrincipal {
  readonly userId: string;
  /** Agency id from the token (unverified hint – use TenantContext for data access). */
  readonly agencyIdHint: string | null;
}

/**
 * Verified tenant context. Built server-side from the `agency_members` row, never
 * from request input. Every tenant-scoped query MUST filter by `agencyId` from here.
 */
export interface TenantContext {
  readonly userId: string;
  readonly agencyId: string;
  readonly memberId: string;
  readonly role: MemberRole;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthPrincipal;
    tenant?: TenantContext;
  }
}
