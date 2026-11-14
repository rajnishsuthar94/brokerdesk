import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type {
  AgencyDetails,
  CreateInvitationResponse,
  DashboardSummary,
  FollowUpView,
  LeadImportResult,
  LeadMatch,
  LeadView,
  MessageTemplateView,
  Paginated,
  PropertyMatch,
  PropertyView,
  ReportSummary,
  SessionResponse,
  SiteVisitView,
  SubscriptionSummary,
  TeamMember,
} from '@brokerdesk/shared-types';
import { TEST_JWT_SECRET } from './test-env.js';
import {
  CLIENT_HEADER,
  HAS_TEST_DB,
  PASSWORD,
  type TestApp,
  type TestUser,
  addMember,
  cookieHeader,
  createTestApp,
  registerUser,
  setSeatLimit,
} from './utils/test-app.js';

/**
 * CRITICAL SECURITY SUITE — cross-tenant isolation.
 *
 * Agency A and Agency B each have an owner and an agent. Every test acts as a
 * user of Agency A and tries to read, modify, delete or infer Agency B's data by
 * swapping resource ids, request parameters, bodies and token claims.
 */
describe.skipIf(!HAS_TEST_DB)('Cross-tenant isolation: Agency A vs Agency B (e2e, MySQL)', () => {
  let t: TestApp;
  let ownerA: TestUser;
  let ownerB: TestUser;
  let agentB: TestUser;
  let agencyA: string;
  let agencyB: string;
  let membersB: TeamMember[];
  let pendingInviteB: CreateInvitationResponse;

  beforeAll(async () => {
    t = await createTestApp();
    ownerA = await registerUser(t, { label: 'ownerA', agencyName: 'Agency A' });
    ownerB = await registerUser(t, { label: 'ownerB', agencyName: 'Agency B' });
    agencyA = ownerA.session.activeAgencyId!;
    agencyB = ownerB.session.activeAgencyId!;
    await setSeatLimit(t, agencyA, 10);
    await setSeatLimit(t, agencyB, 10);

    agentB = await registerUser(t, { label: 'agentB' });
    await addMember(t, ownerB, agentB, 'AGENT');
    const agentA = await registerUser(t, { label: 'agentA' });
    await addMember(t, ownerA, agentA, 'AGENT');

    membersB = (await t.http().get('/api/v1/agencies/current/members').set(ownerB.auth).expect(200)).body as TeamMember[];
    pendingInviteB = (
      await t.http().post('/api/v1/agencies/current/invitations').set(ownerB.auth).send({ email: 'future.b@example.test', role: 'AGENT' }).expect(201)
    ).body as CreateInvitationResponse;
  });

  afterAll(async () => {
    await t?.close();
  });

  const memberBId = (): string => membersB.find((m) => m.role === 'AGENT')!.memberId;
  const ownerBMemberId = (): string => membersB.find((m) => m.role === 'OWNER')!.memberId;

  it('lists only its own agency and members', async () => {
    const agency = (await t.http().get('/api/v1/agencies/current').set(ownerA.auth).expect(200)).body as AgencyDetails;
    expect(agency.id).toBe(agencyA);

    const members = (await t.http().get('/api/v1/agencies/current/members').set(ownerA.auth).expect(200)).body as TeamMember[];
    expect(members).toHaveLength(2);
    const bIds = new Set(membersB.flatMap((m) => [m.memberId, m.userId, m.email]));
    for (const m of members) {
      expect(bIds.has(m.memberId) || bIds.has(m.userId) || bIds.has(m.email)).toBe(false);
    }

    const invites = (await t.http().get('/api/v1/agencies/current/invitations').set(ownerA.auth).expect(200)).body as { email: string }[];
    expect(invites.map((i) => i.email)).not.toContain('future.b@example.test');
  });

  it("cannot change the role of Agency B's member by id (404, unchanged)", async () => {
    await t.http().patch(`/api/v1/agencies/current/members/${memberBId()}`).set(ownerA.auth).send({ role: 'ADMIN' }).expect(404);
    const row = await t.prisma.agencyMember.findUniqueOrThrow({ where: { id: memberBId() } });
    expect(row.role).toBe('AGENT');
  });

  it("cannot remove Agency B's members by id (404, still present)", async () => {
    await t.http().delete(`/api/v1/agencies/current/members/${memberBId()}`).set(ownerA.auth).expect(404);
    await t.http().delete(`/api/v1/agencies/current/members/${ownerBMemberId()}`).set(ownerA.auth).expect(404);
    expect(await t.prisma.agencyMember.count({ where: { agencyId: agencyB } })).toBe(2);
  });

  it("cannot revoke Agency B's invitation by id (404, still pending)", async () => {
    await t.http().delete(`/api/v1/agencies/current/invitations/${pendingInviteB.invitation.id}`).set(ownerA.auth).expect(404);
    const inv = await t.prisma.agencyInvitation.findUniqueOrThrow({ where: { id: pendingInviteB.invitation.id } });
    expect(inv.revokedAt).toBeNull();
  });

  it('cannot infer whether a foreign id exists: foreign and random ids give identical responses', async () => {
    const foreign = await t.http().patch(`/api/v1/agencies/current/members/${memberBId()}`).set(ownerA.auth).send({ role: 'ADMIN' });
    const random = await t.http().patch(`/api/v1/agencies/current/members/${randomUUID()}`).set(ownerA.auth).send({ role: 'ADMIN' });
    expect(foreign.status).toBe(random.status);
    expect(foreign.body).toEqual(random.body);

    const switchForeign = await t.http().post('/api/v1/auth/switch-agency').set(ownerA.auth).send({ agencyId: agencyB });
    const switchRandom = await t.http().post('/api/v1/auth/switch-agency').set(ownerA.auth).send({ agencyId: randomUUID() });
    expect(switchForeign.status).toBe(403);
    expect(switchForeign.body).toEqual(switchRandom.body);
  });

  it('cannot get an access token scoped to Agency B via switch, login or refresh', async () => {
    await t.http().post('/api/v1/auth/switch-agency').set(ownerA.auth).send({ agencyId: agencyB }).expect(403);

    const login = await t.http().post('/api/v1/auth/login').send({ email: ownerA.email, password: PASSWORD, agencyId: agencyB }).expect(200);
    expect((login.body as SessionResponse).activeAgencyId).toBe(agencyA);

    const refresh = await t
      .http()
      .post('/api/v1/auth/refresh')
      .set(CLIENT_HEADER)
      .set('Cookie', cookieHeader(ownerA.refreshToken))
      .send({ agencyId: agencyB })
      .expect(200);
    expect((refresh.body as SessionResponse).activeAgencyId).toBe(agencyA);
  });

  it("a validly signed token claiming Agency B is rejected because membership is checked in the database", async () => {
    // Worst case: the signing secret leaked, or a future bug signs the wrong agency id.
    const forged = new JwtService().sign(
      { sub: ownerA.session.user.id, aid: agencyB, typ: 'access' },
      { secret: TEST_JWT_SECRET, issuer: 'brokerdesk-api', audience: 'brokerdesk-web', expiresIn: 300 },
    );
    const auth = { Authorization: `Bearer ${forged}` };
    for (const path of ['/api/v1/agencies/current', '/api/v1/agencies/current/members', '/api/v1/agencies/current/invitations']) {
      const res = await t.http().get(path).set(auth).expect(403);
      expect((res.body as { code: string }).code).toBe('NOT_A_MEMBER');
    }
    await t.http().patch('/api/v1/agencies/current').set(auth).send({ name: 'Hacked' }).expect(403);
    expect((await t.prisma.agency.findUniqueOrThrow({ where: { id: agencyB } })).name).toBe('Agency B');
  });

  it('ignores agency ids smuggled in request bodies (rejected as unknown fields)', async () => {
    await t.http().patch('/api/v1/agencies/current').set(ownerA.auth).send({ agencyId: agencyB, name: 'Renamed' }).expect(400);
    await t.http().patch('/api/v1/agencies/current').set(ownerA.auth).send({ id: agencyB, name: 'Renamed' }).expect(400);
    await t
      .http()
      .post('/api/v1/agencies/current/invitations')
      .set(ownerA.auth)
      .send({ email: 'x@example.test', role: 'AGENT', agencyId: agencyB })
      .expect(400);
    expect((await t.prisma.agency.findUniqueOrThrow({ where: { id: agencyB } })).name).toBe('Agency B');
  });

  it("cannot accept Agency B's invitation with an Agency A account (email mismatch)", async () => {
    const token = new URL(pendingInviteB.inviteUrl).searchParams.get('token')!;
    await t.http().post('/api/v1/invitations/accept').set(ownerA.auth).send({ token }).expect(400);
    expect(await t.prisma.agencyMember.count({ where: { agencyId: agencyB, userId: ownerA.session.user.id } })).toBe(0);
    const inv = await t.prisma.agencyInvitation.findUniqueOrThrow({ where: { id: pendingInviteB.invitation.id } });
    expect(inv.acceptedAt).toBeNull();
  });

  it('a removed member loses access immediately, even with an unexpired access token', async () => {
    const temp = await registerUser(t, { label: 'tempB' });
    const tempAuth = await addMember(t, ownerB, temp, 'AGENT');
    await t.http().get('/api/v1/agencies/current/members').set(tempAuth).expect(200);

    const tempMember = await t.prisma.agencyMember.findFirstOrThrow({ where: { agencyId: agencyB, userId: temp.session.user.id } });
    await t.http().delete(`/api/v1/agencies/current/members/${tempMember.id}`).set(ownerB.auth).expect(204);

    const res = await t.http().get('/api/v1/agencies/current/members').set(tempAuth).expect(403);
    expect((res.body as { code: string }).code).toBe('NOT_A_MEMBER');
  });

  it('the database itself rejects child rows that point at another agency (composite foreign keys)', async () => {
    const leadA = await t.prisma.lead.create({ data: { agencyId: agencyA, name: 'Lead of A', phone: '+919800000001' } });
    await expect(
      t.prisma.followUp.create({ data: { agencyId: agencyB, leadId: leadA.id, dueAt: new Date() } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      t.prisma.leadActivity.create({ data: { agencyId: agencyB, leadId: leadA.id, activityType: 'NOTE', description: 'x' } }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('agency-scoped routes require an active agency', async () => {
    const loner = await registerUser(t, { label: 'loner' });
    const res = await t.http().get('/api/v1/agencies/current').set(loner.auth).expect(403);
    expect((res.body as { code: string }).code).toBe('NO_ACTIVE_AGENCY');
  });
  describe('leads', () => {
    let leadB: LeadView;
    let leadA: LeadView;
    const B_PHONE = '+919825099001';

    beforeAll(async () => {
      leadB = (
        await t.http().post('/api/v1/leads').set(ownerB.auth)
          .send({ name: 'Private Buyer B', phone: B_PHONE, budgetMax: 9000000, preferredLocation: 'Gota', notes: 'confidential' })
          .expect(201)
      ).body as LeadView;
      leadA = (await t.http().post('/api/v1/leads').set(ownerA.auth).send({ name: 'Buyer A', phone: '9825099002' }).expect(201)).body as LeadView;
    });

    it("cannot read, edit, re-status, reassign, delete or annotate Agency B's lead by id (all 404)", async () => {
      const id = leadB.id;
      await t.http().get(`/api/v1/leads/${id}`).set(ownerA.auth).expect(404);
      await t.http().patch(`/api/v1/leads/${id}`).set(ownerA.auth).send({ notes: 'hacked' }).expect(404);
      await t.http().patch(`/api/v1/leads/${id}/status`).set(ownerA.auth).send({ status: 'LOST' }).expect(404);
      await t.http().patch(`/api/v1/leads/${id}/assignee`).set(ownerA.auth).send({ assignedUserId: null }).expect(404);
      await t.http().delete(`/api/v1/leads/${id}`).set(ownerA.auth).expect(404);
      await t.http().get(`/api/v1/leads/${id}/activities`).set(ownerA.auth).expect(404);
      await t.http().post(`/api/v1/leads/${id}/activities`).set(ownerA.auth).send({ activityType: 'NOTE', description: 'x' }).expect(404);

      const row = await t.prisma.lead.findUniqueOrThrow({ where: { id } });
      expect(row).toMatchObject({ notes: 'confidential', status: 'NEW', deletedAt: null });
      expect(await t.prisma.leadActivity.count({ where: { leadId: id } })).toBe(0);
    });

    it('foreign lead ids and random ids are indistinguishable', async () => {
      const foreign = await t.http().get(`/api/v1/leads/${leadB.id}`).set(ownerA.auth);
      const random = await t.http().get(`/api/v1/leads/${randomUUID()}`).set(ownerA.auth);
      expect(foreign.status).toBe(random.status);
      expect(foreign.body).toEqual(random.body);
    });

    it("never lists, searches or exports Agency B's leads", async () => {
      for (const q of ['', '?search=Private', '?search=9825099001', '?search=Gota', `?assignedTo=${ownerB.session.user.id}`]) {
        const page = (await t.http().get(`/api/v1/leads${q}`).set(ownerA.auth).expect(200)).body as Paginated<LeadView>;
        expect(page.items.map((l) => l.id)).not.toContain(leadB.id);
      }
      const csv = (await t.http().get('/api/v1/leads/export').set(ownerA.auth).expect(200)).text;
      expect(csv).not.toContain('Private Buyer B');
      expect(csv).not.toContain('9825099001');
    });

    it('duplicate detection does not reveal that Agency B has a buyer with the same phone', async () => {
      const res = await t.http().post('/api/v1/leads').set(ownerA.auth).send({ name: 'Same Number', phone: B_PHONE }).expect(201);
      expect(JSON.stringify(res.body)).not.toContain('Private Buyer B');
      const preview = await t.http().post('/api/v1/leads/import?mode=preview').set(ownerA.auth)
        .attach('file', Buffer.from(`Name,Phone
Another,${B_PHONE}
`), 'l.csv').expect(200);
      expect(JSON.stringify(preview.body)).not.toContain('Private Buyer B');
    });

    it("cannot assign leads to Agency B's members (create, update, assign, import)", async () => {
      const bUser = ownerB.session.user.id;
      await t.http().post('/api/v1/leads').set(ownerA.auth).send({ name: 'X Y', phone: '9825099003', assignedUserId: bUser }).expect(400);
      await t.http().patch(`/api/v1/leads/${leadA.id}`).set(ownerA.auth).send({ assignedUserId: bUser }).expect(400);
      await t.http().patch(`/api/v1/leads/${leadA.id}/assignee`).set(ownerA.auth).send({ assignedUserId: bUser }).expect(400);
      const preview = (await t.http().post('/api/v1/leads/import?mode=preview').set(ownerA.auth)
        .attach('file', Buffer.from(`Name,Phone,Assigned To
Zed,9825099004,${ownerB.email}
`), 'l.csv').expect(200)).body as LeadImportResult;
      expect(preview.invalid[0]?.messages.join(' ')).toContain('not a member of your team');
      expect((await t.prisma.lead.findUniqueOrThrow({ where: { id: leadA.id } })).assignedUserId).toBeNull();
    });

    it('a validly signed token claiming Agency B cannot list its leads', async () => {
      const forged = new JwtService().sign(
        { sub: ownerA.session.user.id, aid: agencyB, typ: 'access' },
        { secret: TEST_JWT_SECRET, issuer: 'brokerdesk-api', audience: 'brokerdesk-web', expiresIn: 300 },
      );
      await t.http().get('/api/v1/leads').set('Authorization', `Bearer ${forged}`).expect(403);
      await t.http().get(`/api/v1/leads/${leadB.id}`).set('Authorization', `Bearer ${forged}`).expect(403);
    });

    it("B's agent (not assigned) cannot see B's owner's lead either", async () => {
      const agentBAuth = await t.http().post('/api/v1/auth/login').send({ email: agentB.email, password: PASSWORD, agencyId: agencyB }).expect(200);
      const auth = { Authorization: `Bearer ${(agentBAuth.body as SessionResponse).accessToken}` };
      await t.http().get(`/api/v1/leads/${leadB.id}`).set(auth).expect(404);
    });
  });
  describe('properties, images & matching', () => {
    let propB: PropertyView;
    let propA: PropertyView;
    let leadA: LeadView;

    beforeAll(async () => {
      const photo = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#336699' } }).jpeg().toBuffer();
      propB = (await t.http().post('/api/v1/properties').set(ownerB.auth)
        .send({ title: 'Private listing of B', propertyType: 'APARTMENT', listingType: 'SALE', location: 'Shela', price: 8500000, bhk: 3, ownerName: 'Secret Owner', ownerPhone: '9825099111' })
        .expect(201)).body as PropertyView;
      propB = (await t.http().post(`/api/v1/properties/${propB.id}/images`).set(ownerB.auth).attach('files', photo, 'b.jpg').expect(201)).body as PropertyView;
      propA = (await t.http().post('/api/v1/properties').set(ownerA.auth)
        .send({ title: 'Listing of A', propertyType: 'APARTMENT', listingType: 'SALE', location: 'Bopal', price: 8000000 })
        .expect(201)).body as PropertyView;
      leadA = (await t.http().post('/api/v1/leads').set(ownerA.auth)
        .send({ name: 'Buyer of A', phone: '9825099222', listingType: 'SALE', budgetMax: 9000000, preferredLocation: 'Shela', bhk: 3 })
        .expect(201)).body as LeadView;
    });

    it("cannot read, edit, delete or touch photos of Agency B's property by id (all 404)", async () => {
      const id = propB.id;
      const imageId = propB.images[0]!.id;
      const photo = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).jpeg().toBuffer();
      await t.http().get(`/api/v1/properties/${id}`).set(ownerA.auth).expect(404);
      await t.http().patch(`/api/v1/properties/${id}`).set(ownerA.auth).send({ price: 1 }).expect(404);
      await t.http().delete(`/api/v1/properties/${id}`).set(ownerA.auth).expect(404);
      await t.http().post(`/api/v1/properties/${id}/images`).set(ownerA.auth).attach('files', photo, 'x.jpg').expect(404);
      await t.http().delete(`/api/v1/properties/${id}/images/${imageId}`).set(ownerA.auth).expect(404);
      await t.http().put(`/api/v1/properties/${id}/images/order`).set(ownerA.auth).send({ imageIds: [imageId] }).expect(404);
      await t.http().get(`/api/v1/properties/${id}/matches`).set(ownerA.auth).expect(404);
      // A's own property cannot be used to delete B's image either.
      await t.http().delete(`/api/v1/properties/${propA.id}/images/${imageId}`).set(ownerA.auth).expect(404);

      const row = await t.prisma.property.findUniqueOrThrow({ where: { id } });
      expect(row.price.toNumber()).toBe(8500000);
      expect(row.deletedAt).toBeNull();
      expect(await t.prisma.propertyImage.count({ where: { propertyId: id } })).toBe(1);
    });

    it("never lists or searches Agency B's properties, and B's listing never appears in A's matches", async () => {
      for (const q of ['', '?search=Private', '?search=Secret', '?search=9825099111', '?availabilityStatus=AVAILABLE']) {
        const page = (await t.http().get(`/api/v1/properties${q}`).set(ownerA.auth).expect(200)).body as Paginated<PropertyView>;
        expect(page.items.map((x) => x.id)).not.toContain(propB.id);
      }
      // B's listing would be a perfect match for A's buyer — it must still not be offered.
      const matches = (await t.http().get(`/api/v1/leads/${leadA.id}/matches`).set(ownerA.auth).expect(200)).body as PropertyMatch[];
      expect(matches.map((m) => m.property.id)).not.toContain(propB.id);
      expect(JSON.stringify(matches)).not.toContain('Private listing of B');
      // ...and A's buyer is never offered to B.
      const leadsForB = (await t.http().get(`/api/v1/properties/${propB.id}/matches`).set(ownerB.auth).expect(200)).body as LeadMatch[];
      expect(leadsForB.map((m) => m.lead.id)).not.toContain(leadA.id);
    });

    it("cannot assign A's property to B's members", async () => {
      await t.http().patch(`/api/v1/properties/${propA.id}`).set(ownerA.auth).send({ assignedUserId: ownerB.session.user.id }).expect(400);
      await t.http().post('/api/v1/properties').set(ownerA.auth)
        .send({ title: 'X listing', propertyType: 'PLOT', listingType: 'SALE', location: 'Gota', price: 100, assignedUserId: agentB.session.user.id })
        .expect(400);
    });

    it('a forged token claiming Agency B cannot list its properties', async () => {
      const forged = new JwtService().sign(
        { sub: ownerA.session.user.id, aid: agencyB, typ: 'access' },
        { secret: TEST_JWT_SECRET, issuer: 'brokerdesk-api', audience: 'brokerdesk-web', expiresIn: 300 },
      );
      await t.http().get('/api/v1/properties').set('Authorization', `Bearer ${forged}`).expect(403);
      await t.http().get(`/api/v1/properties/${propB.id}`).set('Authorization', `Bearer ${forged}`).expect(403);
    });
  });

  describe('follow-ups, site visits & dashboard', () => {
    let leadA: LeadView;
    let leadB: LeadView;
    let propA: PropertyView;
    let propB: PropertyView;
    let followUpB: FollowUpView;
    let visitB: SiteVisitView;
    const soon = (): string => new Date(Date.now() + 86_400_000).toISOString();

    beforeAll(async () => {
      leadA = (await t.http().post('/api/v1/leads').set(ownerA.auth).send({ name: 'Visitor of A', phone: '9825077001' }).expect(201)).body as LeadView;
      leadB = (await t.http().post('/api/v1/leads').set(ownerB.auth).send({ name: 'Visitor of B', phone: '9825077002' }).expect(201)).body as LeadView;
      propA = (await t.http().post('/api/v1/properties').set(ownerA.auth)
        .send({ title: 'Visit flat of A', propertyType: 'APARTMENT', listingType: 'RENT', location: 'Bodakdev', price: 30000 }).expect(201)).body as PropertyView;
      propB = (await t.http().post('/api/v1/properties').set(ownerB.auth)
        .send({ title: 'Visit flat of B', propertyType: 'APARTMENT', listingType: 'RENT', location: 'Thaltej', price: 35000 }).expect(201)).body as PropertyView;
      followUpB = (await t.http().post('/api/v1/follow-ups').set(ownerB.auth).send({ leadId: leadB.id, dueAt: soon(), notes: 'Secret note of B' }).expect(201)).body as FollowUpView;
      visitB = (await t.http().post('/api/v1/site-visits').set(ownerB.auth).send({ leadId: leadB.id, propertyId: propB.id, scheduledAt: soon() }).expect(201)).body as SiteVisitView;
    });

    it("cannot schedule follow-ups or visits on Agency B's leads/properties, or mix A's and B's records", async () => {
      await t.http().post('/api/v1/follow-ups').set(ownerA.auth).send({ leadId: leadB.id, dueAt: soon() }).expect(404);
      await t.http().post('/api/v1/site-visits').set(ownerA.auth).send({ leadId: leadB.id, propertyId: propA.id, scheduledAt: soon() }).expect(404);
      await t.http().post('/api/v1/site-visits').set(ownerA.auth).send({ leadId: leadA.id, propertyId: propB.id, scheduledAt: soon() }).expect(404);
      await t.http().post('/api/v1/follow-ups').set(ownerA.auth).send({ leadId: leadA.id, dueAt: soon(), assignedUserId: ownerB.session.user.id }).expect(400);
      expect(await t.prisma.followUp.count({ where: { leadId: leadB.id } })).toBe(1);
      expect(await t.prisma.siteVisit.count({ where: { OR: [{ leadId: leadB.id }, { propertyId: propB.id }] } })).toBe(1);
    });

    it("cannot read or change Agency B's follow-ups and visits by id (404, same as a random id)", async () => {
      for (const [path, body] of [
        [`/api/v1/follow-ups/${followUpB.id}/complete`, {}],
        [`/api/v1/follow-ups/${followUpB.id}/cancel`, {}],
        [`/api/v1/site-visits/${visitB.id}/complete`, { feedback: 'x' }],
        [`/api/v1/site-visits/${visitB.id}/cancel`, {}],
      ] as const) {
        const foreign = await t.http().post(path).set(ownerA.auth).send(body);
        const random = await t.http().post(path.replace(/[0-9a-f-]{36}/, randomUUID())).set(ownerA.auth).send(body);
        expect(foreign.status).toBe(404);
        expect(foreign.body).toEqual(random.body);
      }
      await t.http().patch(`/api/v1/follow-ups/${followUpB.id}`).set(ownerA.auth).send({ dueAt: soon() }).expect(404);
      await t.http().patch(`/api/v1/site-visits/${visitB.id}`).set(ownerA.auth).send({ scheduledAt: soon() }).expect(404);
      await t.http().get(`/api/v1/leads/${leadB.id}/follow-ups`).set(ownerA.auth).expect(404);
      await t.http().get(`/api/v1/leads/${leadB.id}/site-visits`).set(ownerA.auth).expect(404);
      await t.http().get(`/api/v1/properties/${propB.id}/site-visits`).set(ownerA.auth).expect(404);

      expect((await t.prisma.followUp.findUniqueOrThrow({ where: { id: followUpB.id } })).status).toBe('PENDING');
      expect((await t.prisma.siteVisit.findUniqueOrThrow({ where: { id: visitB.id } })).status).toBe('SCHEDULED');
    });

    it("never lists Agency B's follow-ups or visits, and A's dashboard counts nothing of B", async () => {
      for (const view of ['all', 'upcoming', 'today', 'overdue']) {
        const page = (await t.http().get(`/api/v1/follow-ups?view=${view}`).set(ownerA.auth).expect(200)).body as Paginated<FollowUpView>;
        expect(page.items.map((f) => f.id)).not.toContain(followUpB.id);
      }
      for (const view of ['all', 'upcoming']) {
        const page = (await t.http().get(`/api/v1/site-visits?view=${view}`).set(ownerA.auth).expect(200)).body as Paginated<SiteVisitView>;
        expect(page.items.map((v) => v.id)).not.toContain(visitB.id);
      }
      const dash = (await t.http().get('/api/v1/dashboard').set(ownerA.auth).expect(200)).body as DashboardSummary;
      const ownLeads = await t.prisma.lead.count({ where: { agencyId: agencyA, deletedAt: null } });
      expect(dash.totals.totalLeads).toBe(ownLeads);
      expect(JSON.stringify(dash)).not.toContain('Visitor of B');
      expect(JSON.stringify(dash)).not.toContain('Secret note of B');
      expect(dash.agenda.siteVisits.map((v) => v.id)).not.toContain(visitB.id);
    });
  });

  describe('templates, reports & subscription', () => {
    it("cannot read, edit or delete Agency B's message templates", async () => {
      const tplB = (await t.http().post('/api/v1/message-templates').set(ownerB.auth)
        .send({ title: 'Secret pitch of B', message: 'Only for B', category: 'GENERAL' }).expect(201)).body as MessageTemplateView;
      const listA = (await t.http().get('/api/v1/message-templates').set(ownerA.auth).expect(200)).body as MessageTemplateView[];
      expect(listA.map((x) => x.id)).not.toContain(tplB.id);
      await t.http().patch(`/api/v1/message-templates/${tplB.id}`).set(ownerA.auth).send({ title: 'Hijacked' }).expect(404);
      await t.http().delete(`/api/v1/message-templates/${tplB.id}`).set(ownerA.auth).expect(404);
      // A can use the same title in its own agency (uniqueness is per agency).
      await t.http().post('/api/v1/message-templates').set(ownerA.auth).send({ title: 'Secret pitch of B', message: 'A copy', category: 'GENERAL' }).expect(201);
      expect((await t.prisma.messageTemplate.findUniqueOrThrow({ where: { id: tplB.id } })).title).toBe('Secret pitch of B');
    });

    it("A's reports and CSV exports never include Agency B's people or numbers", async () => {
      const report = (await t.http().get('/api/v1/reports').set(ownerA.auth).expect(200)).body as ReportSummary;
      const ownLeads = await t.prisma.lead.count({ where: { agencyId: agencyA, deletedAt: null, createdAt: { gte: new Date(Date.now() - 40 * 86_400_000) } } });
      expect(report.totals.newLeads).toBeLessThanOrEqual(ownLeads);
      const names = report.team.map((r) => r.name).join('|');
      for (const m of membersB) expect(names).not.toContain(m.name);
      expect(JSON.stringify(report)).not.toContain('Visit flat of B');
      const csv = await t.http().get('/api/v1/reports/export?section=team').set(ownerA.auth).expect(200);
      for (const m of membersB) expect(csv.text).not.toContain(m.email);
    });

    it("A's subscription view shows only A's usage", async () => {
      const sub = (await t.http().get('/api/v1/subscription').set(ownerA.auth).expect(200)).body as SubscriptionSummary;
      expect(sub.usage.leads).toBe(await t.prisma.lead.count({ where: { agencyId: agencyA, deletedAt: null } }));
      expect(sub.usage.members).toBe(await t.prisma.agencyMember.count({ where: { agencyId: agencyA } }));
    });
  });
});
