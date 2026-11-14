import { MemberRole } from '../generated/prisma/enums.js';
import { canAssignRole, canInvite, canManageMember } from './member-policy.js';

const { OWNER, ADMIN, AGENT } = MemberRole;

describe('member policy', () => {
  it.each([
    [OWNER, OWNER, true],
    [OWNER, ADMIN, true],
    [OWNER, AGENT, true],
    [ADMIN, OWNER, false],
    [ADMIN, ADMIN, true],
    [ADMIN, AGENT, true],
    [AGENT, OWNER, false],
    [AGENT, ADMIN, false],
    [AGENT, AGENT, false],
  ])('%s inviting as %s → %s', (actor, role, expected) => {
    expect(canInvite(actor, role)).toBe(expected);
    expect(canAssignRole(actor, role)).toBe(expected);
  });

  it.each([
    [OWNER, OWNER, true],
    [OWNER, ADMIN, true],
    [OWNER, AGENT, true],
    [ADMIN, OWNER, false],
    [ADMIN, ADMIN, false],
    [ADMIN, AGENT, true],
    [AGENT, OWNER, false],
    [AGENT, ADMIN, false],
    [AGENT, AGENT, false],
  ])('%s managing a %s → %s', (actor, target, expected) => {
    expect(canManageMember(actor, target)).toBe(expected);
  });
});
