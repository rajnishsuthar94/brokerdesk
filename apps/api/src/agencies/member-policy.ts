/**
 * Membership rules live in @brokerdesk/shared-types so the API (enforcement) and
 * the web app (which actions to offer) can never drift apart.
 */
export { canAssignRole, canInvite, canManageMember } from '@brokerdesk/shared-types';
