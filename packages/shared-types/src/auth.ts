import type { MemberRole } from './enums.js';

export interface SessionUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly phone: string | null;
}

export interface MembershipSummary {
  readonly memberId: string;
  readonly agencyId: string;
  readonly agencyName: string;
  readonly role: MemberRole;
}

/** Returned by register, login, refresh, switch-agency and change-password. */
export interface SessionResponse {
  /** Short-lived JWT. Keep in memory only — never in localStorage. */
  readonly accessToken: string;
  /** Lifetime of the access token in seconds. */
  readonly expiresIn: number;
  readonly user: SessionUser;
  readonly memberships: readonly MembershipSummary[];
  /** Agency the access token is scoped to, or null if the user has no agency yet. */
  readonly activeAgencyId: string | null;
}

export interface RegisterRequest {
  readonly name: string;
  readonly email: string;
  readonly phone?: string;
  readonly password: string;
  /** Omit when joining an existing agency via an invitation. */
  readonly agencyName?: string;
}

export interface LoginRequest {
  readonly email: string;
  readonly password: string;
  /** Preferred agency (e.g. last used). Ignored unless the user is a member. */
  readonly agencyId?: string;
}

export interface AgencyDetails {
  readonly id: string;
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly address: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly country: string;
  readonly timezone: string;
  readonly createdAt: string;
}

export interface TeamMember {
  readonly memberId: string;
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly phone: string | null;
  readonly role: MemberRole;
  readonly joinedAt: string;
}

export interface PendingInvitation {
  readonly id: string;
  readonly email: string;
  readonly role: MemberRole;
  readonly invitedByName: string;
  readonly expiresAt: string;
  readonly createdAt: string;
}

export interface CreateInvitationResponse {
  readonly invitation: PendingInvitation;
  /** Shareable link (e.g. via WhatsApp). Only the invited email address can accept it. */
  readonly inviteUrl: string;
}

export interface InvitationPreview {
  readonly agencyName: string;
  readonly email: string;
  readonly role: MemberRole;
  readonly invitedByName: string;
  readonly expiresAt: string;
}

export interface AcceptInvitationResponse {
  readonly agencyId: string;
}

/** Error body shape for errors that carry a machine-readable code. */
export const ApiErrorCode = {
  NO_ACTIVE_AGENCY: 'NO_ACTIVE_AGENCY',
  NOT_A_MEMBER: 'NOT_A_MEMBER',
  INSUFFICIENT_ROLE: 'INSUFFICIENT_ROLE',
  REFRESH_RACE: 'REFRESH_RACE',
  SEAT_LIMIT_REACHED: 'SEAT_LIMIT_REACHED',
  LEAD_LIMIT_REACHED: 'LEAD_LIMIT_REACHED',
  DUPLICATE_LEAD: 'DUPLICATE_LEAD',
} as const;
export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];
