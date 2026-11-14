import { MemberRole } from './enums.js';

/**
 * Who may manage whom inside an agency. Single source of truth used by the API
 * (enforcement) and the web app (deciding which buttons to show).
 *
 *            | invite as / assign | change role or remove
 * OWNER      | OWNER/ADMIN/AGENT  | anyone (except self)
 * ADMIN      | ADMIN/AGENT        | AGENT members only
 * AGENT      | —                  | —
 *
 * Also enforced by the API: nobody changes their own role, and an agency always
 * keeps at least one OWNER.
 */

export function canInvite(actor: MemberRole, invitedRole: MemberRole): boolean {
  switch (actor) {
    case MemberRole.OWNER:
      return true;
    case MemberRole.ADMIN:
      return invitedRole !== MemberRole.OWNER;
    default:
      return false;
  }
}

export function canManageMember(actor: MemberRole, target: MemberRole): boolean {
  switch (actor) {
    case MemberRole.OWNER:
      return true;
    case MemberRole.ADMIN:
      return target === MemberRole.AGENT;
    default:
      return false;
  }
}

export function canAssignRole(actor: MemberRole, newRole: MemberRole): boolean {
  return canInvite(actor, newRole);
}

/** Roles `actor` may hand out (for invite / change-role pickers). */
export function assignableRoles(actor: MemberRole): MemberRole[] {
  return [MemberRole.OWNER, MemberRole.ADMIN, MemberRole.AGENT].filter((r) => canAssignRole(actor, r));
}
