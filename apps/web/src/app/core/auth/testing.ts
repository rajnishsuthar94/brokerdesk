import type { MembershipSummary, SessionResponse } from '@brokerdesk/shared-types';

/** Test fixture: a session for an OWNER of "Sabarmati Realty". */
export function fakeSession(overrides: Partial<SessionResponse> = {}): SessionResponse {
  const membership: MembershipSummary = {
    memberId: 'm-1',
    agencyId: 'agency-a',
    agencyName: 'Sabarmati Realty',
    role: 'OWNER',
  };
  return {
    accessToken: 'token-1',
    expiresIn: 900,
    user: { id: 'u-1', name: 'Ramesh Patel', email: 'ramesh@example.com', phone: null },
    memberships: [membership],
    activeAgencyId: 'agency-a',
    ...overrides,
  };
}
