import type { EnquiryFormSettings, LeadActivityView, LeadView, Paginated } from '@brokerdesk/shared-types';
import {
  HAS_TEST_DB,
  type TestApp,
  type TestUser,
  addMember,
  createTestApp,
  registerUser,
  setSeatLimit,
} from './utils/test-app.js';

const enquiry = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  name: 'Kiran Joshi',
  phone: '98250 66001',
  listingType: 'SALE',
  propertyType: 'APARTMENT',
  bhk: 3,
  budgetMax: 8500000,
  preferredLocation: 'Bopal',
  message: 'Need east facing, ready possession',
  consent: true,
  channel: 'qr',
  ...overrides,
});

describe.skipIf(!HAS_TEST_DB)('Public enquiry form (e2e, MySQL)', () => {
  let t: TestApp;
  let owner: TestUser;
  let agencyId: string;
  let settings: EnquiryFormSettings;

  const leads = async (auth: { Authorization: string }, q = ''): Promise<readonly LeadView[]> =>
    ((await t.http().get(`/api/v1/leads${q}`).set(auth).expect(200)).body as Paginated<LeadView>).items;

  beforeAll(async () => {
    t = await createTestApp();
    owner = await registerUser(t, { label: 'formowner', agencyName: 'Bopal Homes & Plots' });
    agencyId = owner.session.activeAgencyId!;
    await t.prisma.subscription.update({ where: { agencyId }, data: { leadLimit: null } });
    settings = (await t.http().get('/api/v1/agencies/current/enquiry-form').set(owner.auth).expect(200)).body as EnquiryFormSettings;
  });
  afterAll(async () => {
    await t?.close();
  });

  it('every new agency gets an enabled, unguessable link', () => {
    expect(settings.enabled).toBe(true);
    expect(settings.slug).toMatch(/^bopal-homes-plots-[0-9a-f]{8}$/);
    expect(settings.url).toBe(`http://localhost:4200/enquire/${settings.slug}`);
  });

  it('shows only public agency info, without login', async () => {
    const res = await t.http().get(`/api/v1/public/enquiry/${settings.slug}`).expect(200);
    expect(res.body).toEqual({ agencyName: 'Bopal Homes & Plots', city: 'Ahmedabad', phone: null });
  });

  it('a submission becomes a NEW, unassigned lead with source ENQUIRY_FORM and a history entry', async () => {
    await t.http().post(`/api/v1/public/enquiry/${settings.slug}`).send(enquiry()).expect(201, { received: true });

    const [lead] = await leads(owner.auth, '?search=Kiran');
    expect(lead).toMatchObject({
      name: 'Kiran Joshi',
      phone: '+919825066001',
      source: 'ENQUIRY_FORM',
      status: 'NEW',
      priority: 'MEDIUM',
      bhk: 3,
      budgetMax: 8500000,
      preferredLocation: 'Bopal',
      notes: 'Need east facing, ready possession',
      assignedUser: null,
    });
    const history = (await t.http().get(`/api/v1/leads/${lead!.id}/activities`).set(owner.auth).expect(200)).body as LeadActivityView[];
    expect(history[0]).toMatchObject({ activityType: 'SYSTEM', user: null });
    expect(history[0]!.description).toContain('online form (QR code)');
    expect(history[0]!.description).toContain('agreed to be contacted');
  });

  it('a repeat enquiry from the same number is added to the existing lead, not duplicated', async () => {
    await t.http().post(`/api/v1/public/enquiry/${settings.slug}`)
      .send(enquiry({ name: 'Kiran J', phone: '+91 98250-66001', channel: 'whatsapp', message: 'Any 4 BHK?' }))
      .expect(201, { received: true });
    const found = await leads(owner.auth, '?search=9825066001');
    expect(found).toHaveLength(1);
    const history = (await t.http().get(`/api/v1/leads/${found[0]!.id}/activities`).set(owner.auth).expect(200)).body as LeadActivityView[];
    expect(history[0]!.description).toMatch(/^Enquired again via the online form \(WhatsApp link\)\..*Message: "Any 4 BHK\?"/);
  });

  it.each([
    ['no consent', { consent: false }],
    ['missing consent', { consent: undefined }],
    ['invalid phone', { phone: '12345' }],
    ['missing name', { name: '' }],
    ['unknown channel', { channel: 'tv' }],
    ['status injection', { status: 'WON' }],
    ['assignee injection', { assignedUserId: '01a1da72-78c1-759c-8c12-5c7c45aa2619' }],
    ['agency injection', { agencyId: '01a1da72-78d5-71c0-aa6a-15a74916629b' }],
    ['source injection', { source: 'REFERRAL' }],
  ])('rejects %s', async (_label, override) => {
    await t.http().post(`/api/v1/public/enquiry/${settings.slug}`).send(enquiry({ phone: '9825066099', ...override })).expect(400);
  });

  it('silently ignores bots that fill the hidden honeypot field', async () => {
    await t.http().post(`/api/v1/public/enquiry/${settings.slug}`)
      .send(enquiry({ name: 'Spam Bot', phone: '9825066002', website: 'http://spam.example' }))
      .expect(201, { received: true });
    expect(await leads(owner.auth, '?search=Spam')).toHaveLength(0);
  });

  it('unknown, malformed and disabled links all return the same 404', async () => {
    const unknown = await t.http().get('/api/v1/public/enquiry/no-such-agency-12345678').expect(404);
    const malformed = await t.http().get('/api/v1/public/enquiry/..%2F..%2Fadmin').expect(404);

    await t.http().patch('/api/v1/agencies/current/enquiry-form').set(owner.auth).send({ enabled: false }).expect(200);
    const disabled = await t.http().get(`/api/v1/public/enquiry/${settings.slug}`).expect(404);
    await t.http().post(`/api/v1/public/enquiry/${settings.slug}`).send(enquiry({ phone: '9825066003' })).expect(404);
    expect(disabled.body).toEqual(unknown.body);
    expect(malformed.body.message).toBe(unknown.body.message);

    await t.http().patch('/api/v1/agencies/current/enquiry-form').set(owner.auth).send({ enabled: true }).expect(200);
    await t.http().get(`/api/v1/public/enquiry/${settings.slug}`).expect(200);
  });

  it('resetting the link disables the old one immediately', async () => {
    const reset = (await t.http().post('/api/v1/agencies/current/enquiry-form/reset-link').set(owner.auth).expect(200)).body as EnquiryFormSettings;
    expect(reset.slug).not.toBe(settings.slug);
    await t.http().get(`/api/v1/public/enquiry/${settings.slug}`).expect(404);
    await t.http().get(`/api/v1/public/enquiry/${reset.slug}`).expect(200);
    expect(await t.prisma.auditLog.count({ where: { agencyId, action: 'enquiry_form.link_reset' } })).toBe(1);
    settings = reset;
  });

  it('agents can see and share the link but not change it; they do not see unassigned form leads', async () => {
    await setSeatLimit(t, agencyId, 5);
    const agentAuth = await addMember(t, owner, await registerUser(t, { label: 'formagent' }), 'AGENT');
    const seen = (await t.http().get('/api/v1/agencies/current/enquiry-form').set(agentAuth).expect(200)).body as EnquiryFormSettings;
    expect(seen.url).toBe(settings.url);
    await t.http().patch('/api/v1/agencies/current/enquiry-form').set(agentAuth).send({ enabled: false }).expect(403);
    await t.http().post('/api/v1/agencies/current/enquiry-form/reset-link').set(agentAuth).expect(403);
    expect(await leads(agentAuth, '?search=Kiran')).toHaveLength(0);
  });

  it("lands only in the link's own agency (tenant isolation)", async () => {
    const other = await registerUser(t, { label: 'otherform', agencyName: 'Other Realty' });
    const otherSettings = (await t.http().get('/api/v1/agencies/current/enquiry-form').set(other.auth).expect(200)).body as EnquiryFormSettings;
    await t.http().post(`/api/v1/public/enquiry/${otherSettings.slug}`).send(enquiry({ name: 'Only Other', phone: '9825066010' })).expect(201);
    expect(await leads(owner.auth, '?search=Only%20Other')).toHaveLength(0);
    expect(await leads(other.auth, '?search=Only%20Other')).toHaveLength(1);
    // The same number in another agency is a NEW lead there, not a repeat of ours.
    await t.http().post(`/api/v1/public/enquiry/${otherSettings.slug}`).send(enquiry({ phone: '9825066001' })).expect(201);
    expect(await leads(other.auth, '?search=9825066001')).toHaveLength(1);
    expect((await leads(owner.auth, '?search=9825066001'))).toHaveLength(1);
  });

  it('respects the plan lead limit with a generic message, and audits it', async () => {
    const small = await registerUser(t, { label: 'smallform', agencyName: 'Small Form Realty' });
    const smallAgency = small.session.activeAgencyId!;
    await t.prisma.subscription.update({ where: { agencyId: smallAgency }, data: { leadLimit: 0 } });
    const s = (await t.http().get('/api/v1/agencies/current/enquiry-form').set(small.auth).expect(200)).body as EnquiryFormSettings;
    const res = await t.http().post(`/api/v1/public/enquiry/${s.slug}`).send(enquiry({ phone: '9825066020' })).expect(403);
    expect(res.body.message).toBe('This agency cannot accept online enquiries right now. Please contact them directly.');
    expect(JSON.stringify(res.body)).not.toMatch(/plan|limit|Free/i);
    expect(await t.prisma.auditLog.count({ where: { agencyId: smallAgency, action: 'enquiry_form.rejected_lead_limit' } })).toBe(1);
  });
});

describe.skipIf(!HAS_TEST_DB)('Public enquiry form abuse limits (e2e, MySQL)', () => {
  let t: TestApp;
  let slug: string;
  beforeAll(async () => {
    t = await createTestApp({ PUBLIC_ENQUIRY_THROTTLE_LIMIT: 3, PUBLIC_ENQUIRY_DAILY_CAP: 2 });
    const owner = await registerUser(t, { label: 'abuse', agencyName: 'Abuse Realty' });
    await t.prisma.subscription.update({ where: { agencyId: owner.session.activeAgencyId! }, data: { leadLimit: null } });
    slug = ((await t.http().get('/api/v1/agencies/current/enquiry-form').set(owner.auth)).body as EnquiryFormSettings).slug;
  });
  afterAll(async () => {
    await t?.close();
  });

  it('caps new leads per agency per day, then rate-limits the IP (429)', async () => {
    await t.http().post(`/api/v1/public/enquiry/${slug}`).send(enquiry({ phone: '9825067001' })).expect(201);
    await t.http().post(`/api/v1/public/enquiry/${slug}`).send(enquiry({ phone: '9825067002' })).expect(201);
    const capped = await t.http().post(`/api/v1/public/enquiry/${slug}`).send(enquiry({ phone: '9825067003' })).expect(429);
    expect(capped.body.message).toContain('Please call them directly');
    // 4th request from the same IP within the window hits the per-IP limit
    // (a different 429 from the daily cap above: the throttler's own message).
    const throttled = await t.http().post(`/api/v1/public/enquiry/${slug}`).send(enquiry({ phone: '9825067004' })).expect(429);
    expect(throttled.body.message).not.toContain('Please call them directly');
    expect(throttled.body.message).toMatch(/too many requests/i);
    // Viewing the form is not rate limited.
    await t.http().get(`/api/v1/public/enquiry/${slug}`).expect(200);
    // The enquiry limit is separate from the auth limit: this IP can still log in.
    for (let i = 0; i < 5; i++) {
      await t.http().post('/api/v1/auth/login').send({ email: 'nobody@example.test', password: 'Wrong@1234' }).expect(401);
    }
  });
});
