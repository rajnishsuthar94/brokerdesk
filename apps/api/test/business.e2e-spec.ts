import type { LeadView, MessageTemplateView, PropertyView, ReportSummary, SubscriptionSummary } from '@brokerdesk/shared-types';
import { DEFAULT_TEMPLATES } from '@brokerdesk/shared-types';
import { HAS_TEST_DB, type TestApp, type TestUser, addMember, createTestApp, registerUser, setSeatLimit } from './utils/test-app.js';

type Auth = { Authorization: string };
const DAY = 86_400_000;
const iso = (offsetMs: number): string => new Date(Date.now() + offsetMs).toISOString();
const istToday = (): string => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

describe.skipIf(!HAS_TEST_DB)('Subscriptions, reports & message templates (e2e, MySQL)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({
      SALES_CONTACT_EMAIL: 'sales@brokerdesk.test',
      PLAN_OVERRIDES: { STARTER: { monthlyPricePaise: 599_00, leadLimit: 300 } },
    });
  });
  afterAll(async () => {
    await t?.close();
  });

  const newLead = async (auth: Auth, body: Record<string, unknown> = {}): Promise<LeadView> =>
    (await t.http().post('/api/v1/leads').set(auth).send({ name: 'Amit Mehta', phone: `98${Math.floor(1e7 + Math.random() * 9e7)}`, ...body }).expect(201)).body as LeadView;

  // ── Subscriptions ─────────────────────────────────────────────────────────
  describe('subscription', () => {
    let owner: TestUser;
    beforeAll(async () => {
      owner = await registerUser(t, { label: 'subowner', agencyName: 'Plan Realty' });
    });

    it('shows plan, limits in force, usage and the configured catalogue', async () => {
      await newLead(owner.auth);
      const s = (await t.http().get('/api/v1/subscription').set(owner.auth).expect(200)).body as SubscriptionSummary;
      expect(s).toMatchObject({ plan: 'FREE', displayName: 'Free', status: 'ACTIVE', active: true, limits: { leads: 25, users: 1 }, usage: { leads: 1, members: 1, pendingInvitations: 0 }, salesContact: 'sales@brokerdesk.test', lastUpgradeRequestAt: null });
      expect(s.plans.map((p) => p.plan)).toEqual(['FREE', 'STARTER', 'PROFESSIONAL', 'BUSINESS']);
      expect(s.plans[1]).toMatchObject({ monthlyPricePaise: 599_00, leadLimit: 300 }); // PLAN_CATALOG_JSON override
    });

    it('an ended paid plan falls back to Free limits (nothing deleted, adding blocked)', async () => {
      const o = await registerUser(t, { label: 'expired', agencyName: 'Expired Realty' });
      const agencyId = o.session.activeAgencyId!;
      await t.prisma.subscription.update({ where: { agencyId }, data: { plan: 'PROFESSIONAL', leadLimit: 1000, userLimit: 3, expiresAt: new Date(Date.now() + DAY) } });
      await t.prisma.lead.createMany({ data: Array.from({ length: 25 }, (_, i) => ({ agencyId, name: `Lead ${i}`, phone: `+9198000${String(i).padStart(5, '0')}` })) });
      await newLead(o.auth); // 26th lead fine while Professional is live

      await t.prisma.subscription.update({ where: { agencyId }, data: { expiresAt: new Date(Date.now() - 1000) } });
      const s = (await t.http().get('/api/v1/subscription').set(o.auth).expect(200)).body as SubscriptionSummary;
      expect(s).toMatchObject({ plan: 'PROFESSIONAL', active: false, limits: { leads: 25, users: 1 }, usage: { leads: 26 } });
      const blocked = await t.http().post('/api/v1/leads').set(o.auth).send({ name: 'One more', phone: '9825011111' }).expect(403);
      expect(blocked.body).toMatchObject({ code: 'LEAD_LIMIT_REACHED' });
      expect(JSON.stringify(blocked.body)).toContain('Free limits apply');
      expect(await t.prisma.lead.count({ where: { agencyId, deletedAt: null } })).toBe(26); // nothing removed
    });

    it('owners request an upgrade (audited + emailed, no payment), with a cooldown; agents cannot', async () => {
      const o = await registerUser(t, { label: 'upgrade', agencyName: 'Upgrade Realty' });
      await setSeatLimit(t, o.session.activeAgencyId!, 5);
      const agent = await registerUser(t, { label: 'upagent' });
      const agentAuth = await addMember(t, o, agent, 'AGENT');
      await t.http().post('/api/v1/subscription/upgrade-request').set(agentAuth).send({ plan: 'STARTER' }).expect(403);
      await t.http().post('/api/v1/subscription/upgrade-request').set(o.auth).send({ plan: 'FREE' }).expect(400);
      await t.http().post('/api/v1/subscription/upgrade-request').set(o.auth).send({ plan: 'GOLD' }).expect(400);

      t.mail.sent.length = 0;
      await t.http().post('/api/v1/subscription/upgrade-request').set(o.auth).send({ plan: 'PROFESSIONAL', note: 'Need 3 seats' }).expect(202);
      const mail = t.mail.sent.find((m) => m.to === 'sales@brokerdesk.test');
      expect(mail?.subject).toContain('Upgrade Realty → Professional');
      expect(mail?.text).toContain('Note: Need 3 seats');
      expect(mail?.text).toContain(`--agency ${o.session.activeAgencyId}`);
      const audit = await t.prisma.auditLog.findFirst({ where: { agencyId: o.session.activeAgencyId!, action: 'subscription.upgrade_requested' } });
      expect(audit?.metadata).toMatchObject({ from: 'FREE', to: 'PROFESSIONAL' });

      await t.http().post('/api/v1/subscription/upgrade-request').set(o.auth).send({ plan: 'BUSINESS' }).expect(400); // cooldown
      const s = (await t.http().get('/api/v1/subscription').set(agentAuth).expect(200)).body as SubscriptionSummary;
      expect(s.lastUpgradeRequestAt).not.toBeNull();
    });
  });

  // ── Reports ───────────────────────────────────────────────────────────────
  describe('reports', () => {
    let owner: TestUser;
    let agentAuth: Auth;
    let agentId: string;

    beforeAll(async () => {
      owner = await registerUser(t, { label: 'repowner', agencyName: 'Report Realty' });
      await setSeatLimit(t, owner.session.activeAgencyId!, 5);
      await t.prisma.subscription.update({ where: { agencyId: owner.session.activeAgencyId! }, data: { leadLimit: null } });
      const agent = await registerUser(t, { label: 'repagent' });
      agentAuth = await addMember(t, owner, agent, 'AGENT');
      agentId = agent.session.user.id;

      const prop = (await t.http().post('/api/v1/properties').set(owner.auth)
        .send({ title: 'Report flat', propertyType: 'APARTMENT', listingType: 'SALE', location: 'Prahlad Nagar', price: 9000000 }).expect(201)).body as PropertyView;
      const a1 = await newLead(owner.auth, { source: 'PROPERTY_PORTAL', assignedUserId: agentId });
      const a2 = await newLead(owner.auth, { source: 'PROPERTY_PORTAL', assignedUserId: agentId });
      await newLead(owner.auth, { source: 'WALK_IN' });
      await newLead(owner.auth, { source: 'REFERRAL', status: 'LOST' });
      await t.http().patch(`/api/v1/leads/${a1.id}/status`).set(agentAuth).send({ status: 'WON' }).expect(200);
      const f = (await t.http().post('/api/v1/follow-ups').set(agentAuth).send({ leadId: a2.id, dueAt: iso(DAY) }).expect(201)).body as { id: string };
      await t.http().post(`/api/v1/follow-ups/${f.id}/complete`).set(agentAuth).send({}).expect(200);
      const v = (await t.http().post('/api/v1/site-visits').set(agentAuth).send({ leadId: a2.id, propertyId: prop.id, scheduledAt: iso(-60_000) }).expect(201)).body as { id: string };
      await t.http().post(`/api/v1/site-visits/${v.id}/complete`).set(agentAuth).send({ feedback: 'Good' }).expect(200);
    });

    it('reports this month by default with defined totals, sources, funnel, team and top properties', async () => {
      const r = (await t.http().get('/api/v1/reports').set(owner.auth).expect(200)).body as ReportSummary;
      expect(r.range.to).toBe(istToday());
      expect(r.scope).toBe('agency');
      expect(r.totals).toEqual({ newLeads: 4, wonDeals: 1, lostDeals: 1, winRate: 50, followUpsCompleted: 1, siteVisitsScheduled: 1, siteVisitsCompleted: 1 });
      expect(r.sources[0]).toEqual({ source: 'PROPERTY_PORTAL', leads: 2, won: 1, conversionRate: 50 });
      expect(r.funnel).toEqual(expect.arrayContaining([{ status: 'WON', count: 1 }, { status: 'LOST', count: 1 }]));
      const agentRow = r.team.find((x) => x.userId === agentId);
      expect(agentRow).toMatchObject({ newLeads: 2, followUpsCompleted: 1, siteVisitsCompleted: 1, wonDeals: 1, lostDeals: 0, role: 'AGENT' });
      expect(r.team.find((x) => x.userId === null)).toMatchObject({ name: 'Unassigned', newLeads: 2, lostDeals: 1 });
      expect(r.topProperties[0]).toMatchObject({ title: 'Report flat', visits: 1, completed: 1 });
    });

    it("agents get their own numbers only", async () => {
      const r = (await t.http().get('/api/v1/reports').set(agentAuth).expect(200)).body as ReportSummary;
      expect(r.scope).toBe('mine');
      expect(r.totals.newLeads).toBe(2);
      expect(r.team.map((x) => x.userId)).toEqual([agentId]);
    });

    it('an empty past range is all zeros; invalid ranges are rejected', async () => {
      const r = (await t.http().get('/api/v1/reports?from=2024-01-01&to=2024-01-31').set(owner.auth).expect(200)).body as ReportSummary;
      expect(r.totals).toMatchObject({ newLeads: 0, winRate: null });
      await t.http().get('/api/v1/reports?from=2026-02-30&to=2026-03-01').set(owner.auth).expect(400);
      await t.http().get('/api/v1/reports?from=2026-11-10&to=2026-11-01').set(owner.auth).expect(400);
      await t.http().get('/api/v1/reports?from=2024-01-01&to=2026-11-01').set(owner.auth).expect(400);
    });

    it('owners export the team and sources tables as CSV (audited); agents cannot', async () => {
      const team = await t.http().get('/api/v1/reports/export?section=team').set(owner.auth).expect(200);
      expect(team.headers['content-type']).toContain('text/csv');
      expect(team.headers['content-disposition']).toMatch(/brokerdesk-team-\d{4}-\d{2}-\d{2}-to-/);
      expect(team.text).toContain('Team member,Role,New leads');
      const sources = await t.http().get('/api/v1/reports/export?section=sources').set(owner.auth).expect(200);
      expect(sources.text).toContain('Property portal,2,1,50');
      await t.http().get('/api/v1/reports/export').set(agentAuth).expect(403);
      await t.http().get('/api/v1/reports/export?section=secrets').set(owner.auth).expect(400);
      expect(await t.prisma.auditLog.count({ where: { agencyId: owner.session.activeAgencyId!, action: 'report.exported' } })).toBe(2);
    });
  });

  // ── Message templates ─────────────────────────────────────────────────────
  describe('message templates', () => {
    let owner: TestUser;
    let agentAuth: Auth;
    beforeAll(async () => {
      owner = await registerUser(t, { label: 'tplowner', agencyName: 'Template Realty' });
      await setSeatLimit(t, owner.session.activeAgencyId!, 5);
      agentAuth = await addMember(t, owner, await registerUser(t, { label: 'tplagent' }), 'AGENT');
    });

    it('starter templates are added once (idempotent), everyone can list them', async () => {
      const first = (await t.http().post('/api/v1/message-templates/defaults').set(owner.auth).expect(200)).body as MessageTemplateView[];
      expect(first).toHaveLength(DEFAULT_TEMPLATES.length);
      const again = (await t.http().post('/api/v1/message-templates/defaults').set(owner.auth).expect(200)).body as MessageTemplateView[];
      expect(again).toHaveLength(DEFAULT_TEMPLATES.length);
      const list = (await t.http().get('/api/v1/message-templates').set(agentAuth).expect(200)).body as MessageTemplateView[];
      expect(list.map((x) => x.title)).toContain('Site visit confirmation');
    });

    it('owners create, edit and delete; titles are unique; agents cannot change them', async () => {
      const created = (await t.http().post('/api/v1/message-templates').set(owner.auth)
        .send({ title: 'Diwali offer', message: 'Happy Diwali {{name}}! Special offers at {{agency}}.', category: 'GENERAL' }).expect(201)).body as MessageTemplateView;
      expect(created).toMatchObject({ title: 'Diwali offer', category: 'GENERAL' });
      await t.http().post('/api/v1/message-templates').set(owner.auth).send({ title: 'Diwali offer', message: 'dup', category: 'GENERAL' }).expect(409);
      await t.http().post('/api/v1/message-templates').set(owner.auth).send({ title: 'Bad', message: 'x'.repeat(2001), category: 'GENERAL' }).expect(400);
      await t.http().post('/api/v1/message-templates').set(owner.auth).send({ title: 'Bad cat', message: 'Hello', category: 'SPAM' }).expect(400);

      await t.http().post('/api/v1/message-templates').set(agentAuth).send({ title: 'Mine', message: 'Hello', category: 'GENERAL' }).expect(403);
      await t.http().patch(`/api/v1/message-templates/${created.id}`).set(agentAuth).send({ title: 'Hacked' }).expect(403);
      await t.http().delete(`/api/v1/message-templates/${created.id}`).set(agentAuth).expect(403);

      const edited = (await t.http().patch(`/api/v1/message-templates/${created.id}`).set(owner.auth).send({ message: 'Happy Diwali {{name}}!' }).expect(200)).body as MessageTemplateView;
      expect(edited.message).toBe('Happy Diwali {{name}}!');
      await t.http().delete(`/api/v1/message-templates/${created.id}`).set(owner.auth).expect(204);
      await t.http().delete(`/api/v1/message-templates/${created.id}`).set(owner.auth).expect(404);
    });
  });
});
