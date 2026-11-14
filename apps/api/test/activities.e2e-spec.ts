import type {
  DashboardSummary,
  FollowUpView,
  LeadActivityView,
  LeadView,
  Paginated,
  PropertyView,
  ReminderCounts,
  SiteVisitView,
} from '@brokerdesk/shared-types';
import {
  HAS_TEST_DB,
  type TestApp,
  type TestUser,
  addMember,
  createTestApp,
  registerUser,
  setSeatLimit,
} from './utils/test-app.js';

type Auth = { Authorization: string };
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const iso = (offsetMs: number): string => new Date(Date.now() + offsetMs).toISOString();

describe.skipIf(!HAS_TEST_DB)('Follow-ups, site visits & dashboard (e2e, MySQL)', () => {
  let t: TestApp;
  let owner: TestUser;
  let agentAuth: Auth;
  let agentUserId: string;

  const newLead = async (auth: Auth, body: Record<string, unknown> = {}): Promise<LeadView> =>
    (await t.http().post('/api/v1/leads').set(auth).send({ name: 'Amit Mehta', phone: `98${Math.floor(1e7 + Math.random() * 9e7)}`, ...body }).expect(201)).body as LeadView;
  const getLead = async (auth: Auth, id: string): Promise<LeadView> => (await t.http().get(`/api/v1/leads/${id}`).set(auth).expect(200)).body as LeadView;
  const history = async (auth: Auth, id: string): Promise<string[]> =>
    ((await t.http().get(`/api/v1/leads/${id}/activities`).set(auth).expect(200)).body as LeadActivityView[]).map((a) => a.description);
  const followUps = async (auth: Auth, view: string): Promise<readonly FollowUpView[]> =>
    ((await t.http().get(`/api/v1/follow-ups?view=${view}`).set(auth).expect(200)).body as Paginated<FollowUpView>).items;

  beforeAll(async () => {
    t = await createTestApp();
    owner = await registerUser(t, { label: 'actowner', agencyName: 'Activity Realty' });
    const agencyId = owner.session.activeAgencyId!;
    await setSeatLimit(t, agencyId, 5);
    await t.prisma.subscription.update({ where: { agencyId }, data: { leadLimit: null } });
    const agent = await registerUser(t, { label: 'actagent' });
    agentAuth = await addMember(t, owner, agent, 'AGENT');
    agentUserId = agent.session.user.id;
  });
  afterAll(async () => {
    await t?.close();
  });

  describe('follow-ups', () => {
    it("drive the lead's next follow-up date and appear in today / overdue / upcoming views", async () => {
      const lead = await newLead(owner.auth);
      expect(lead.nextFollowUpAt).toBeNull();

      const tomorrow = (await t.http().post('/api/v1/follow-ups').set(owner.auth).send({ leadId: lead.id, dueAt: iso(DAY + HOUR), notes: 'Share brochure' }).expect(201)).body as FollowUpView;
      expect(tomorrow).toMatchObject({ status: 'PENDING', notes: 'Share brochure', assignedUser: { id: owner.session.user.id } });
      expect((await getLead(owner.auth, lead.id)).nextFollowUpAt).toBe(tomorrow.dueAt);

      const late = (await t.http().post('/api/v1/follow-ups').set(owner.auth).send({ leadId: lead.id, dueAt: iso(-2 * DAY) }).expect(201)).body as FollowUpView;
      expect((await getLead(owner.auth, lead.id)).nextFollowUpAt).toBe(late.dueAt); // earliest pending wins

      expect((await followUps(owner.auth, 'overdue')).map((f) => f.id)).toContain(late.id);
      expect((await followUps(owner.auth, 'upcoming')).map((f) => f.id)).toContain(tomorrow.id);
      expect((await followUps(owner.auth, 'overdue')).map((f) => f.id)).not.toContain(tomorrow.id);
      expect((await history(owner.auth, lead.id)).some((d) => d.startsWith('Follow-up scheduled for') && d.endsWith('Share brochure'))).toBe(true);
    });

    it('complete (with next follow-up), reschedule and cancel — each recorded in history', async () => {
      const lead = await newLead(owner.auth);
      const f = (await t.http().post('/api/v1/follow-ups').set(owner.auth).send({ leadId: lead.id, dueAt: iso(-HOUR) }).expect(201)).body as FollowUpView;

      const done = (await t.http().post(`/api/v1/follow-ups/${f.id}/complete`).set(owner.auth).send({ outcome: 'Wants Sunday visit', nextDueAt: iso(3 * DAY) }).expect(200)).body as FollowUpView;
      expect(done).toMatchObject({ status: 'COMPLETED' });
      expect(done.completedAt).not.toBeNull();
      await t.http().post(`/api/v1/follow-ups/${f.id}/complete`).set(owner.auth).send({}).expect(400); // already closed

      const [next] = (await t.http().get(`/api/v1/leads/${lead.id}/follow-ups`).set(owner.auth).expect(200)).body as FollowUpView[];
      expect(next!.status).toBe('PENDING');
      expect((await getLead(owner.auth, lead.id)).nextFollowUpAt).toBe(next!.dueAt);

      const moved = (await t.http().patch(`/api/v1/follow-ups/${next!.id}`).set(owner.auth).send({ dueAt: iso(5 * DAY) }).expect(200)).body as FollowUpView;
      expect((await getLead(owner.auth, lead.id)).nextFollowUpAt).toBe(moved.dueAt);

      await t.http().post(`/api/v1/follow-ups/${next!.id}/cancel`).set(owner.auth).send({ reason: 'Bought elsewhere' }).expect(200);
      expect((await getLead(owner.auth, lead.id)).nextFollowUpAt).toBeNull();

      const h = await history(owner.auth, lead.id);
      expect(h).toEqual(expect.arrayContaining([
        'Follow-up done: Wants Sunday visit',
        expect.stringMatching(/^Next follow-up scheduled for/),
        expect.stringMatching(/^Follow-up rescheduled from .* to /),
        expect.stringMatching(/cancelled: Bought elsewhere$/),
      ]));
    });

    it('creating a lead with a follow-up date creates a real follow-up', async () => {
      const lead = await newLead(owner.auth, { nextFollowUpAt: iso(2 * DAY) });
      const list = (await t.http().get(`/api/v1/leads/${lead.id}/follow-ups`).set(owner.auth).expect(200)).body as FollowUpView[];
      expect(list).toHaveLength(1);
      expect(lead.nextFollowUpAt).toBe(list[0]!.dueAt);
      // The lead is unassigned, so the follow-up is the creator's (it must show in someone's reminders).
      expect(list[0]!.assignedUser?.id).toBe(owner.session.user.id);
      // The date can no longer be set directly on an existing lead.
      await t.http().patch(`/api/v1/leads/${lead.id}`).set(owner.auth).send({ nextFollowUpAt: iso(DAY) }).expect(400);
    });

    it("agents only see and manage follow-ups of their own leads", async () => {
      const ownersLead = await newLead(owner.auth);
      const f = (await t.http().post('/api/v1/follow-ups').set(owner.auth).send({ leadId: ownersLead.id, dueAt: iso(DAY) }).expect(201)).body as FollowUpView;
      await t.http().post('/api/v1/follow-ups').set(agentAuth).send({ leadId: ownersLead.id, dueAt: iso(DAY) }).expect(404);
      await t.http().post(`/api/v1/follow-ups/${f.id}/complete`).set(agentAuth).send({}).expect(404);
      expect((await followUps(agentAuth, 'all')).map((x) => x.id)).not.toContain(f.id);

      const mine = await newLead(agentAuth);
      const own = (await t.http().post('/api/v1/follow-ups').set(agentAuth).send({ leadId: mine.id, dueAt: iso(DAY) }).expect(201)).body as FollowUpView;
      expect(own.assignedUser?.id).toBe(agentUserId);
      await t.http().post('/api/v1/follow-ups').set(agentAuth).send({ leadId: mine.id, dueAt: iso(DAY), assignedUserId: owner.session.user.id }).expect(403);
    });

    it('rejects invalid dates and unknown views', async () => {
      const lead = await newLead(owner.auth);
      await t.http().post('/api/v1/follow-ups').set(owner.auth).send({ leadId: lead.id, dueAt: 'tomorrow' }).expect(400);
      await t.http().get('/api/v1/follow-ups?view=someday').set(owner.auth).expect(400);
    });
  });

  describe('site visits', () => {
    let property: PropertyView;
    beforeAll(async () => {
      property = (await t.http().post('/api/v1/properties').set(owner.auth)
        .send({ title: 'Applewoods 3BHK', propertyType: 'APARTMENT', listingType: 'SALE', location: 'Shela', price: 8500000 }).expect(201)).body as PropertyView;
    });

    it('scheduling moves an early-stage lead to Site Visit and is recorded; complete stores feedback', async () => {
      const lead = await newLead(owner.auth, { status: 'QUALIFIED' });
      const visit = (await t.http().post('/api/v1/site-visits').set(owner.auth)
        .send({ leadId: lead.id, propertyId: property.id, scheduledAt: iso(2 * DAY), notes: 'Meet at gate' }).expect(201)).body as SiteVisitView;
      expect(visit).toMatchObject({ status: 'SCHEDULED', property: { id: property.id, title: 'Applewoods 3BHK' }, lead: { id: lead.id } });
      expect((await getLead(owner.auth, lead.id)).status).toBe('SITE_VISIT');

      const upcoming = ((await t.http().get('/api/v1/site-visits?view=upcoming').set(owner.auth).expect(200)).body as Paginated<SiteVisitView>).items;
      expect(upcoming.map((v) => v.id)).toContain(visit.id);

      const moved = (await t.http().patch(`/api/v1/site-visits/${visit.id}`).set(owner.auth).send({ scheduledAt: iso(3 * DAY) }).expect(200)).body as SiteVisitView;
      expect(moved.status).toBe('RESCHEDULED');

      const done = (await t.http().post(`/api/v1/site-visits/${visit.id}/complete`).set(owner.auth).send({ feedback: 'Liked it, wants a better price' }).expect(200)).body as SiteVisitView;
      expect(done).toMatchObject({ status: 'COMPLETED', feedback: 'Liked it, wants a better price' });
      await t.http().post(`/api/v1/site-visits/${visit.id}/cancel`).set(owner.auth).send({}).expect(400);

      const h = await history(owner.auth, lead.id);
      expect(h).toEqual(expect.arrayContaining([
        expect.stringMatching(/^Site visit scheduled: Applewoods 3BHK on .*\. Meet at gate$/),
        'Status changed to Site Visit (visit scheduled)',
        expect.stringMatching(/rescheduled to/),
        'Visited Applewoods 3BHK. Feedback: Liked it, wants a better price',
      ]));
      const forProperty = (await t.http().get(`/api/v1/properties/${property.id}/site-visits`).set(owner.auth).expect(200)).body as SiteVisitView[];
      expect(forProperty.map((v) => v.id)).toContain(visit.id);
    });

    it('does not change a lead already in negotiation; cancelled visits are past', async () => {
      const lead = await newLead(owner.auth, { status: 'NEGOTIATION' });
      const v = (await t.http().post('/api/v1/site-visits').set(owner.auth).send({ leadId: lead.id, propertyId: property.id, scheduledAt: iso(DAY) }).expect(201)).body as SiteVisitView;
      expect((await getLead(owner.auth, lead.id)).status).toBe('NEGOTIATION');
      await t.http().post(`/api/v1/site-visits/${v.id}/cancel`).set(owner.auth).send({ reason: 'Owner unavailable' }).expect(200);
      const past = ((await t.http().get('/api/v1/site-visits?view=past').set(owner.auth).expect(200)).body as Paginated<SiteVisitView>).items;
      expect(past.find((x) => x.id === v.id)?.status).toBe('CANCELLED');
    });

    it("agents can't schedule visits for others' leads or see them", async () => {
      const ownersLead = await newLead(owner.auth);
      const v = (await t.http().post('/api/v1/site-visits').set(owner.auth).send({ leadId: ownersLead.id, propertyId: property.id, scheduledAt: iso(DAY) }).expect(201)).body as SiteVisitView;
      await t.http().post('/api/v1/site-visits').set(agentAuth).send({ leadId: ownersLead.id, propertyId: property.id, scheduledAt: iso(DAY) }).expect(404);
      await t.http().post(`/api/v1/site-visits/${v.id}/complete`).set(agentAuth).send({}).expect(404);
      const agentList = ((await t.http().get('/api/v1/site-visits?view=all').set(agentAuth).expect(200)).body as Paginated<SiteVisitView>).items;
      expect(agentList.map((x) => x.id)).not.toContain(v.id);
    });
  });

  describe('dashboard', () => {
    it('reports real numbers, monthly charts and reminders for the agency', async () => {
      const d = await registerUser(t, { label: 'dash', agencyName: 'Dash Realty' });
      const a: Auth = d.auth;
      const l1 = await newLead(a, { source: 'WALK_IN' });
      const l2 = await newLead(a, { source: 'WALK_IN', status: 'WON' });
      await newLead(a, { source: 'REFERRAL', status: 'LOST' });
      await newLead(a, { source: 'PROPERTY_PORTAL' });
      await t.http().patch(`/api/v1/leads/${l1.id}/status`).set(a).send({ status: 'WON' }).expect(200);
      await t.http().post('/api/v1/follow-ups').set(a).send({ leadId: l2.id, dueAt: iso(-DAY), notes: 'Overdue one' }).expect(201);
      await t.http().post('/api/v1/follow-ups').set(a).send({ leadId: l2.id, dueAt: iso(10 * 60_000) }).expect(201);
      const p = (await t.http().post('/api/v1/properties').set(a).send({ title: 'Gota plot', propertyType: 'PLOT', listingType: 'SALE', location: 'Gota', price: 100 }).expect(201)).body as PropertyView;
      await t.http().post('/api/v1/site-visits').set(a).send({ leadId: l1.id, propertyId: p.id, scheduledAt: iso(2 * DAY) }).expect(201);

      const s = (await t.http().get('/api/v1/dashboard').set(a).expect(200)).body as DashboardSummary;
      expect(s.scope).toBe('agency');
      expect(s.totals).toMatchObject({
        totalLeads: 4, newLeadsThisMonth: 4, wonDeals: 2, lostLeads: 1, conversionRate: 50,
        overdueFollowUps: 1, upcomingSiteVisits: 1,
      });
      expect(s.totals.followUpsDueToday).toBeGreaterThanOrEqual(0); // depends on the IST time of day the test runs
      expect(s.leadsBySource[0]).toEqual({ source: 'WALK_IN', count: 2 });
      expect(s.leadsByStatus).toEqual(expect.arrayContaining([{ status: 'WON', count: 2 }, { status: 'LOST', count: 1 }]));
      expect(s.monthlyEnquiries).toHaveLength(6);
      expect(s.monthlyEnquiries.at(-1)!.count).toBe(4);
      expect(s.monthlyDeals.at(-1)).toMatchObject({ count: 2, lost: 1 });
      expect(s.monthlySiteVisits.reduce((n, m) => n + m.count, 0)).toBe(1);
      expect(s.agenda.followUps[0]).toMatchObject({ notes: 'Overdue one' });
      expect(s.agenda.siteVisits).toHaveLength(1);
    });

    it('reminder counts (header bell) are personal: only items assigned to the caller', async () => {
      const r = await registerUser(t, { label: 'bell', agencyName: 'Bell Realty' });
      await setSeatLimit(t, r.session.activeAgencyId!, 5);
      const helper = await registerUser(t, { label: 'bellagent' });
      const helperAuth = await addMember(t, r, helper, 'AGENT');
      const ownLead = await newLead(r.auth);
      const helpersLead = await newLead(r.auth, { assignedUserId: helper.session.user.id });
      await t.http().post('/api/v1/follow-ups').set(r.auth).send({ leadId: ownLead.id, dueAt: iso(-HOUR) }).expect(201);
      // Defaults to the lead's assignee (the helper).
      await t.http().post('/api/v1/follow-ups').set(r.auth).send({ leadId: helpersLead.id, dueAt: iso(-2 * HOUR) }).expect(201);
      // An agent can't be given work on a lead they can't see.
      await t.http().post('/api/v1/follow-ups').set(r.auth).send({ leadId: ownLead.id, dueAt: iso(DAY), assignedUserId: helper.session.user.id }).expect(400);

      const mine = (await t.http().get('/api/v1/dashboard/reminders').set(r.auth).expect(200)).body as ReminderCounts;
      expect(mine).toEqual({ overdueFollowUps: 1, followUpsDueToday: 0, siteVisitsToday: 0 });
      const theirs = (await t.http().get('/api/v1/dashboard/reminders').set(helperAuth).expect(200)).body as ReminderCounts;
      expect(theirs.overdueFollowUps).toBe(1);
    });

    it("reassigning a lead hands the previous assignee's open follow-ups and visits to the new one", async () => {
      const r = await registerUser(t, { label: 'handover', agencyName: 'Handover Realty' });
      await setSeatLimit(t, r.session.activeAgencyId!, 5);
      const a1 = await registerUser(t, { label: 'ho1' });
      const a2 = await registerUser(t, { label: 'ho2' });
      const a1Auth = await addMember(t, r, a1, 'AGENT');
      const a2Auth = await addMember(t, r, a2, 'AGENT');
      const lead = await newLead(r.auth, { assignedUserId: a1.session.user.id });
      const p = (await t.http().post('/api/v1/properties').set(r.auth).send({ title: 'Handover flat', propertyType: 'APARTMENT', listingType: 'SALE', location: 'Vastrapur', price: 5000000 }).expect(201)).body as PropertyView;
      const f = (await t.http().post('/api/v1/follow-ups').set(a1Auth).send({ leadId: lead.id, dueAt: iso(DAY) }).expect(201)).body as FollowUpView;
      const v = (await t.http().post('/api/v1/site-visits').set(a1Auth).send({ leadId: lead.id, propertyId: p.id, scheduledAt: iso(DAY) }).expect(201)).body as SiteVisitView;

      await t.http().patch(`/api/v1/leads/${lead.id}/assignee`).set(r.auth).send({ assignedUserId: a2.session.user.id }).expect(200);
      expect((await t.prisma.followUp.findUniqueOrThrow({ where: { id: f.id } })).assignedUserId).toBe(a2.session.user.id);
      expect((await t.prisma.siteVisit.findUniqueOrThrow({ where: { id: v.id } })).assignedUserId).toBe(a2.session.user.id);
      await t.http().post(`/api/v1/follow-ups/${f.id}/complete`).set(a2Auth).send({}).expect(200);
      await t.http().post(`/api/v1/site-visits/${v.id}/complete`).set(a1Auth).send({}).expect(404);
    });

    it("an agent's dashboard only counts their own leads", async () => {
      await newLead(agentAuth);
      const s = (await t.http().get('/api/v1/dashboard').set(agentAuth).expect(200)).body as DashboardSummary;
      expect(s.scope).toBe('mine');
      const own = await t.prisma.lead.count({ where: { assignedUserId: agentUserId, deletedAt: null } });
      expect(s.totals.totalLeads).toBe(own);
    });
  });
});
