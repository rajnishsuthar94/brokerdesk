import type { CreateInvitationResponse, InvitationPreview, SessionResponse, TeamMember } from '@brokerdesk/shared-types';
import {
  HAS_TEST_DB,
  type TestApp,
  type TestUser,
  addMember,
  createTestApp,
  registerUser,
  setSeatLimit,
} from './utils/test-app.js';

/** Role-based access control and team management rules inside one agency. */
describe.skipIf(!HAS_TEST_DB)('Team management & roles (e2e, MySQL)', () => {
  let t: TestApp;
  let owner: TestUser;
  let admin: TestUser;
  let agent: TestUser;
  let adminAuth: { Authorization: string };
  let agentAuth: { Authorization: string };
  let agencyId: string;

  const members = async (): Promise<TeamMember[]> =>
    (await t.http().get('/api/v1/agencies/current/members').set(owner.auth).expect(200)).body as TeamMember[];
  const memberOf = async (u: TestUser): Promise<TeamMember> =>
    (await members()).find((m) => m.email === u.email)!;

  beforeAll(async () => {
    t = await createTestApp();
    owner = await registerUser(t, { label: 'owner', agencyName: 'RBAC Realty' });
    agencyId = owner.session.activeAgencyId!;
    await setSeatLimit(t, agencyId, 10);
    admin = await registerUser(t, { label: 'admin' });
    agent = await registerUser(t, { label: 'agent' });
    adminAuth = await addMember(t, owner, admin, 'ADMIN');
    agentAuth = await addMember(t, owner, agent, 'AGENT');
  });
  afterAll(async () => {
    await t?.close();
  });

  describe('AGENT', () => {
    it('can view the team but cannot manage it or the agency', async () => {
      await t.http().get('/api/v1/agencies/current/members').set(agentAuth).expect(200);
      await t.http().get('/api/v1/agencies/current/invitations').set(agentAuth).expect(403);
      await t.http().post('/api/v1/agencies/current/invitations').set(agentAuth).send({ email: 'x@example.test', role: 'AGENT' }).expect(403);
      await t.http().patch('/api/v1/agencies/current').set(agentAuth).send({ name: 'Mine now' }).expect(403);
      const ownerMember = await memberOf(owner);
      await t.http().patch(`/api/v1/agencies/current/members/${ownerMember.memberId}`).set(agentAuth).send({ role: 'AGENT' }).expect(403);
      await t.http().delete(`/api/v1/agencies/current/members/${ownerMember.memberId}`).set(agentAuth).expect(403);
    });
  });

  describe('ADMIN', () => {
    it('can invite agents and admins but not owners', async () => {
      await t.http().post('/api/v1/agencies/current/invitations').set(adminAuth).send({ email: 'agent2@example.test', role: 'AGENT' }).expect(201);
      await t.http().post('/api/v1/agencies/current/invitations').set(adminAuth).send({ email: 'admin2@example.test', role: 'ADMIN' }).expect(201);
      await t.http().post('/api/v1/agencies/current/invitations').set(adminAuth).send({ email: 'owner2@example.test', role: 'OWNER' }).expect(403);
    });

    it('can update agency details', async () => {
      const res = await t.http().patch('/api/v1/agencies/current').set(adminAuth).send({ city: 'Gandhinagar', phone: '' }).expect(200);
      expect(res.body).toMatchObject({ city: 'Gandhinagar', phone: null, name: 'RBAC Realty' });
    });

    it('cannot promote anyone to OWNER or touch owners/other admins', async () => {
      const agentMember = await memberOf(agent);
      const ownerMember = await memberOf(owner);
      await t.http().patch(`/api/v1/agencies/current/members/${agentMember.memberId}`).set(adminAuth).send({ role: 'OWNER' }).expect(403);
      await t.http().patch(`/api/v1/agencies/current/members/${ownerMember.memberId}`).set(adminAuth).send({ role: 'AGENT' }).expect(403);
      await t.http().delete(`/api/v1/agencies/current/members/${ownerMember.memberId}`).set(adminAuth).expect(403);
    });
  });

  describe('OWNER', () => {
    it('cannot change their own role', async () => {
      const self = await memberOf(owner);
      await t.http().patch(`/api/v1/agencies/current/members/${self.memberId}`).set(owner.auth).send({ role: 'ADMIN' }).expect(400);
    });

    it('the last owner cannot leave', async () => {
      await t.http().post('/api/v1/agencies/current/leave').set(owner.auth).expect(409);
    });

    it('role changes take effect immediately on existing tokens', async () => {
      const agentMember = await memberOf(agent);
      await t.http().patch(`/api/v1/agencies/current/members/${agentMember.memberId}`).set(owner.auth).send({ role: 'ADMIN' }).expect(200);
      await t.http().get('/api/v1/agencies/current/invitations').set(agentAuth).expect(200);
      await t.http().patch(`/api/v1/agencies/current/members/${agentMember.memberId}`).set(owner.auth).send({ role: 'AGENT' }).expect(200);
      await t.http().get('/api/v1/agencies/current/invitations').set(agentAuth).expect(403);
      expect(await t.prisma.auditLog.count({ where: { agencyId, action: 'member.role_changed' } })).toBe(2);
    });

    it('removing a member un-assigns their work in this agency', async () => {
      const temp = await registerUser(t, { label: 'temp' });
      await addMember(t, owner, temp, 'AGENT');
      const lead = await t.prisma.lead.create({
        data: { agencyId, name: 'Buyer', phone: '+919811111111', assignedUserId: temp.session.user.id },
      });
      const tempMember = await memberOf(temp);
      await t.http().delete(`/api/v1/agencies/current/members/${tempMember.memberId}`).set(owner.auth).expect(204);
      expect((await t.prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).assignedUserId).toBeNull();
    });

    it('with a second owner, an owner can leave', async () => {
      const coOwner = await registerUser(t, { label: 'coowner' });
      const coAuth = await addMember(t, owner, coOwner, 'OWNER');
      await t.http().post('/api/v1/agencies/current/leave').set(coAuth).expect(204);
      await t.http().get('/api/v1/agencies/current').set(coAuth).expect(403);
    });
  });

  describe('invitations', () => {
    it('preview shows agency details; accept joins with the invited role; the link works once', async () => {
      const invitee = await registerUser(t, { label: 'invitee' });
      const created = (
        await t.http().post('/api/v1/agencies/current/invitations').set(owner.auth).send({ email: invitee.email.toUpperCase(), role: 'AGENT' }).expect(201)
      ).body as CreateInvitationResponse;
      expect(created.inviteUrl).toMatch(/^http:\/\/localhost:4200\/invite\?token=/);
      expect(t.mail.sent.some((m) => m.to === invitee.email)).toBe(true);
      const token = new URL(created.inviteUrl).searchParams.get('token')!;

      const preview = (await t.http().post('/api/v1/invitations/preview').send({ token }).expect(200)).body as InvitationPreview;
      expect(preview).toMatchObject({ agencyName: 'RBAC Realty', email: invitee.email, role: 'AGENT' });

      const accepted = await t.http().post('/api/v1/invitations/accept').set(invitee.auth).send({ token }).expect(200);
      expect(accepted.body).toEqual({ agencyId });
      await t.http().post('/api/v1/invitations/accept').set(invitee.auth).send({ token }).expect(400);
      await t.http().post('/api/v1/invitations/preview').send({ token }).expect(404);
    });

    it('expired and revoked invitations cannot be used', async () => {
      const invitee = await registerUser(t, { label: 'late' });
      const created = (
        await t.http().post('/api/v1/agencies/current/invitations').set(owner.auth).send({ email: invitee.email, role: 'AGENT' }).expect(201)
      ).body as CreateInvitationResponse;
      const token = new URL(created.inviteUrl).searchParams.get('token')!;
      await t.prisma.agencyInvitation.update({ where: { id: created.invitation.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      await t.http().post('/api/v1/invitations/accept').set(invitee.auth).send({ token }).expect(400);

      const again = (
        await t.http().post('/api/v1/agencies/current/invitations').set(owner.auth).send({ email: invitee.email, role: 'AGENT' }).expect(201)
      ).body as CreateInvitationResponse;
      await t.http().delete(`/api/v1/agencies/current/invitations/${again.invitation.id}`).set(owner.auth).expect(204);
      const token2 = new URL(again.inviteUrl).searchParams.get('token')!;
      await t.http().post('/api/v1/invitations/accept').set(invitee.auth).send({ token: token2 }).expect(400);
    });

    it('rejects inviting an existing member', async () => {
      await t.http().post('/api/v1/agencies/current/invitations').set(owner.auth).send({ email: agent.email, role: 'AGENT' }).expect(409);
    });
  });

  describe('subscription seat limits (enforced by the API)', () => {
    it('a FREE agency (1 user) cannot invite anyone', async () => {
      const solo = await registerUser(t, { label: 'solo', agencyName: 'Solo Realty' });
      const res = await t
        .http()
        .post('/api/v1/agencies/current/invitations')
        .set(solo.auth)
        .send({ email: 'helper@example.test', role: 'AGENT' })
        .expect(403);
      expect((res.body as { code: string }).code).toBe('SEAT_LIMIT_REACHED');
    });

    it('pending invitations count toward the limit', async () => {
      const boss = await registerUser(t, { label: 'boss', agencyName: 'Two Seat Realty' });
      await setSeatLimit(t, boss.session.activeAgencyId!, 2);
      await t.http().post('/api/v1/agencies/current/invitations').set(boss.auth).send({ email: 'one@example.test', role: 'AGENT' }).expect(201);
      await t.http().post('/api/v1/agencies/current/invitations').set(boss.auth).send({ email: 'two@example.test', role: 'AGENT' }).expect(403);
      // Re-inviting the same person replaces their pending invitation instead of using a new seat.
      await t.http().post('/api/v1/agencies/current/invitations').set(boss.auth).send({ email: 'one@example.test', role: 'ADMIN' }).expect(201);
    });
  });

  describe('multiple agencies', () => {
    it('a user can create a second agency and switch between them', async () => {
      const created = await t.http().post('/api/v1/agencies').set(owner.auth).send({ name: 'Second Branch', city: 'Surat' }).expect(201);
      const secondId = (created.body as { id: string }).id;
      const switched = (await t.http().post('/api/v1/auth/switch-agency').set(owner.auth).send({ agencyId: secondId }).expect(200))
        .body as SessionResponse;
      expect(switched.activeAgencyId).toBe(secondId);
      expect(switched.memberships.map((m) => m.agencyName)).toEqual(expect.arrayContaining(['RBAC Realty', 'Second Branch']));

      const current = await t.http().get('/api/v1/agencies/current').set('Authorization', `Bearer ${switched.accessToken}`).expect(200);
      expect(current.body).toMatchObject({ name: 'Second Branch', city: 'Surat' });
    });
  });
});
