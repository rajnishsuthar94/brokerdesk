import type {
  LeadActivityView,
  LeadImportResult,
  LeadView,
  Paginated,
  TeamMember,
} from '@brokerdesk/shared-types';
import { zipSync } from 'fflate';
import writeExcelFile from 'write-excel-file/node';
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

describe.skipIf(!HAS_TEST_DB)('Leads (e2e, MySQL)', () => {
  let t: TestApp;
  let owner: TestUser;
  let agencyId: string;
  let agentAuth: Auth;
  let agentUserId: string;
  let otherAgentAuth: Auth;

  const lead = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    name: 'Amit Mehta',
    phone: `98${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`,
    budgetMin: 7500000,
    budgetMax: 9000000,
    preferredLocation: 'Shela',
    bhk: 3,
    propertyType: 'APARTMENT',
    listingType: 'SALE',
    source: 'PROPERTY_PORTAL',
    ...overrides,
  });

  const create = async (auth: Auth, body: Record<string, unknown> = lead()): Promise<LeadView> =>
    (await t.http().post('/api/v1/leads').set(auth).send(body).expect(201)).body as LeadView;

  const list = async (auth: Auth, query = ''): Promise<Paginated<LeadView>> =>
    (await t.http().get(`/api/v1/leads${query}`).set(auth).expect(200)).body as Paginated<LeadView>;

  beforeAll(async () => {
    t = await createTestApp();
    owner = await registerUser(t, { label: 'leadowner', agencyName: 'Leads Realty' });
    agencyId = owner.session.activeAgencyId!;
    await setSeatLimit(t, agencyId, 10);
    await t.prisma.subscription.update({ where: { agencyId }, data: { leadLimit: null } });
    const agent = await registerUser(t, { label: 'leadagent' });
    agentAuth = await addMember(t, owner, agent, 'AGENT');
    agentUserId = agent.session.user.id;
    otherAgentAuth = await addMember(t, owner, await registerUser(t, { label: 'otheragent' }), 'AGENT');
  });
  afterAll(async () => {
    await t?.close();
  });

  describe('create & read', () => {
    it('creates a lead with normalised phone and decimal budgets', async () => {
      const created = await create(owner.auth, lead({ phone: '+91 98250-11111', email: ' Amit@Example.COM ', notes: '  Needs parking ' }));
      expect(created).toMatchObject({
        phone: '+919825011111',
        email: 'amit@example.com',
        budgetMin: 7500000,
        budgetMax: 9000000,
        status: 'NEW',
        priority: 'MEDIUM',
        notes: 'Needs parking',
        assignedUser: null,
      });
      const fetched = (await t.http().get(`/api/v1/leads/${created.id}`).set(owner.auth).expect(200)).body as LeadView;
      expect(fetched.id).toBe(created.id);
    });

    it('accepts international numbers for NRI buyers', async () => {
      const created = await create(owner.auth, lead({ phone: '+1 415 555 0199' }));
      expect(created.phone).toBe('+14155550199');
    });

    it.each([
      ['missing name', { name: undefined }],
      ['invalid phone', { phone: '12345' }],
      ['min budget above max', { budgetMin: 9000000, budgetMax: 1000000 }],
      ['negative budget', { budgetMin: -5 }],
      ['bad BHK', { bhk: 0 }],
      ['unknown status', { status: 'MAYBE' }],
      ['agencyId injection', { agencyId: '01a1da72-78d5-71c0-aa6a-15a74916629b' }],
    ])('rejects %s', async (_label, override) => {
      await t.http().post('/api/v1/leads').set(owner.auth).send(lead(override)).expect(400);
    });

    it('warns about duplicate phones unless allowDuplicate is set', async () => {
      const first = await create(owner.auth, lead({ phone: '9825022222' }));
      const dup = await t.http().post('/api/v1/leads').set(owner.auth).send(lead({ phone: '+919825022222', name: 'Other' })).expect(409);
      expect(dup.body).toMatchObject({ code: 'DUPLICATE_LEAD', existingLead: { id: first.id, name: first.name } });
      await create(owner.auth, lead({ phone: '9825022222', name: 'Other', allowDuplicate: true }));
    });

    it('rejects assigning to someone outside the agency', async () => {
      const outsider = await registerUser(t, { label: 'outsider', agencyName: 'Elsewhere' });
      await t.http().post('/api/v1/leads').set(owner.auth).send(lead({ assignedUserId: outsider.session.user.id })).expect(400);
    });
  });

  describe('agents', () => {
    it("see only their own leads; others' leads are 404", async () => {
      const mine = await create(agentAuth, lead({ name: 'Agent Lead' }));
      expect(mine.assignedUser?.id).toBe(agentUserId); // auto-assigned
      const ownersLead = await create(owner.auth, lead({ name: 'Owner Lead' }));

      const visible = await list(agentAuth, '?pageSize=100');
      expect(visible.items.map((l) => l.id)).toContain(mine.id);
      expect(visible.items.every((l) => l.assignedUser?.id === agentUserId)).toBe(true);

      await t.http().get(`/api/v1/leads/${ownersLead.id}`).set(agentAuth).expect(404);
      await t.http().patch(`/api/v1/leads/${ownersLead.id}`).set(agentAuth).send({ notes: 'x' }).expect(404);
      await t.http().get(`/api/v1/leads/${mine.id}`).set(otherAgentAuth).expect(404);
    });

    it('cannot delete, reassign, import or export, nor create leads for others', async () => {
      const mine = await create(agentAuth);
      await t.http().delete(`/api/v1/leads/${mine.id}`).set(agentAuth).expect(403);
      await t.http().patch(`/api/v1/leads/${mine.id}/assignee`).set(agentAuth).send({ assignedUserId: null }).expect(403);
      await t.http().patch(`/api/v1/leads/${mine.id}`).set(agentAuth).send({ assignedUserId: owner.session.user.id }).expect(403);
      await t.http().get('/api/v1/leads/export').set(agentAuth).expect(403);
      await t.http().post('/api/v1/leads/import?mode=preview').set(agentAuth).attach('file', Buffer.from('Name,Phone\nA,9825000000\n'), 'a.csv').expect(403);
      await t.http().post('/api/v1/leads').set(agentAuth).send(lead({ assignedUserId: owner.session.user.id })).expect(403);
    });

    it('do not learn details of duplicates they cannot see', async () => {
      await create(owner.auth, lead({ phone: '9825033333', name: 'Secret Buyer' }));
      const res = await t.http().post('/api/v1/leads').set(agentAuth).send(lead({ phone: '9825033333' })).expect(409);
      expect(JSON.stringify(res.body)).not.toContain('Secret Buyer');
      expect(res.body).not.toHaveProperty('existingLead.id');
    });
  });

  describe('status, assignment and activity history', () => {
    it('records status changes, assignments and notes in the timeline', async () => {
      const l = await create(owner.auth);
      await t.http().patch(`/api/v1/leads/${l.id}/status`).set(owner.auth).send({ status: 'QUALIFIED', note: 'Budget confirmed' }).expect(200);
      const assigned = (await t.http().patch(`/api/v1/leads/${l.id}/assignee`).set(owner.auth).send({ assignedUserId: agentUserId }).expect(200)).body as LeadView;
      expect(assigned.assignedUser?.id).toBe(agentUserId);
      await t.http().post(`/api/v1/leads/${l.id}/activities`).set(agentAuth).send({ activityType: 'CALL', description: 'Spoke for 10 min' }).expect(201);
      await t.http().post(`/api/v1/leads/${l.id}/activities`).set(agentAuth).send({ activityType: 'STATUS_CHANGE', description: 'forged' }).expect(400);

      const history = (await t.http().get(`/api/v1/leads/${l.id}/activities`).set(owner.auth).expect(200)).body as LeadActivityView[];
      expect(history.map((h) => [h.activityType, h.description])).toEqual([
        ['CALL', 'Spoke for 10 min'],
        ['ASSIGNMENT', expect.stringMatching(/^Assigned to Test leadagent$/)],
        ['STATUS_CHANGE', 'Status changed from New to Qualified. Budget confirmed'],
      ]);
    });

    it('editing status/assignee via PATCH also records history', async () => {
      const l = await create(owner.auth);
      await t.http().patch(`/api/v1/leads/${l.id}`).set(owner.auth).send({ status: 'CONTACTED', assignedUserId: agentUserId, budgetMax: 9500000 }).expect(200);
      const history = (await t.http().get(`/api/v1/leads/${l.id}/activities`).set(owner.auth).expect(200)).body as LeadActivityView[];
      expect(history.map((h) => h.activityType).sort()).toEqual(['ASSIGNMENT', 'STATUS_CHANGE']);
    });

    it('validates budget ranges against stored values on partial updates', async () => {
      const l = await create(owner.auth, lead({ budgetMin: 5000000, budgetMax: 6000000 }));
      await t.http().patch(`/api/v1/leads/${l.id}`).set(owner.auth).send({ budgetMax: 4000000 }).expect(400);
    });
  });

  it('soft-deletes: gone from lists and lookups, history kept, audited', async () => {
    const l = await create(owner.auth);
    await t.http().delete(`/api/v1/leads/${l.id}`).set(owner.auth).expect(204);
    await t.http().get(`/api/v1/leads/${l.id}`).set(owner.auth).expect(404);
    expect((await list(owner.auth, `?search=${encodeURIComponent(l.phone.slice(3))}`)).items).toHaveLength(0);
    const row = await t.prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
    expect(row.deletedAt).not.toBeNull();
    expect(await t.prisma.auditLog.count({ where: { action: 'lead.deleted', entityId: l.id } })).toBe(1);
  });

  describe('search, filters, sorting, pagination', () => {
    let fresh: TestUser;
    beforeAll(async () => {
      fresh = await registerUser(t, { label: 'filters', agencyName: 'Filter Realty' });
      await t.prisma.subscription.update({ where: { agencyId: fresh.session.activeAgencyId! }, data: { leadLimit: null } });
      const soon = new Date(Date.now() + 3 * 86_400_000).toISOString();
      const past = new Date(Date.now() - 2 * 86_400_000).toISOString();
      await create(fresh.auth, lead({ name: 'Bhavesh Rent', listingType: 'RENT', budgetMin: 20000, budgetMax: 30000, status: 'NEW', priority: 'LOW', preferredLocation: 'Prahlad Nagar' }));
      await create(fresh.auth, lead({ name: 'Chirag Overdue', status: 'CONTACTED', priority: 'HIGH', nextFollowUpAt: past }));
      await create(fresh.auth, lead({ name: 'Disha Upcoming', status: 'QUALIFIED', nextFollowUpAt: soon, email: 'disha@example.com' }));
      await create(fresh.auth, lead({ name: 'Esha Won', status: 'WON', nextFollowUpAt: past }));
      await create(fresh.auth, lead({ name: 'Farhan Phone', phone: '9898012345', source: 'WALK_IN' }));
    });

    const names = async (query: string): Promise<string[]> => (await list(fresh.auth, query)).items.map((l) => l.name);

    it('searches by name, email, location and partial phone', async () => {
      expect(await names('?search=chirag')).toEqual(['Chirag Overdue']);
      expect(await names('?search=disha%40example')).toEqual(['Disha Upcoming']);
      expect(await names('?search=prahlad')).toEqual(['Bhavesh Rent']);
      expect(await names('?search=98980%2012')).toEqual(['Farhan Phone']);
    });

    it('filters by status (multi), listing type, source and follow-up', async () => {
      expect((await names('?status=WON&status=CONTACTED')).sort()).toEqual(['Chirag Overdue', 'Esha Won']);
      expect(await names('?status=WON,CONTACTED&listingType=SALE&priority=HIGH')).toEqual(['Chirag Overdue']);
      expect(await names('?listingType=RENT')).toEqual(['Bhavesh Rent']);
      expect(await names('?source=WALK_IN')).toEqual(['Farhan Phone']);
      expect(await names('?followUp=overdue')).toEqual(['Chirag Overdue']); // closed "Won" excluded
      expect(await names('?followUp=upcoming')).toEqual(['Disha Upcoming']);
    });

    it('sorts and paginates without overlap', async () => {
      expect(await names('?sort=name&order=asc')).toEqual(['Bhavesh Rent', 'Chirag Overdue', 'Disha Upcoming', 'Esha Won', 'Farhan Phone']);
      expect((await names('?sort=priority&order=desc'))[0]).toBe('Chirag Overdue');
      const p1 = await list(fresh.auth, '?sort=name&pageSize=2&page=1');
      const p3 = await list(fresh.auth, '?sort=name&order=asc&pageSize=2&page=3');
      expect(p1.total).toBe(5);
      expect(p1.items).toHaveLength(2);
      expect(p3.items.map((l) => l.name)).toEqual(['Farhan Phone']);
    });

    it('rejects invalid query values', async () => {
      await t.http().get('/api/v1/leads?pageSize=1000').set(fresh.auth).expect(400);
      await t.http().get('/api/v1/leads?status=BOGUS').set(fresh.auth).expect(400);
      await t.http().get('/api/v1/leads?sort=passwordHash').set(fresh.auth).expect(400);
    });
  });

  describe('CSV export', () => {
    it('exports filtered leads as CSV with formula-injection protection', async () => {
      const exp = await registerUser(t, { label: 'export', agencyName: 'Export Realty' });
      await create(exp.auth, lead({ name: '=HYPERLINK("http://evil.example","click")', phone: '9825044444' }));
      await create(exp.auth, lead({ name: 'Plain, Buyer', phone: '9825055555', listingType: 'RENT' }));
      const res = await t.http().get('/api/v1/leads/export?listingType=SALE').set(exp.auth).expect(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="brokerdesk-leads-\d{4}-\d{2}-\d{2}\.csv"/);
      const text = res.text;
      expect(text.startsWith('﻿Name,Phone,')).toBe(true);
      expect(text).toContain(`"'=HYPERLINK(""http://evil.example"",""click"")"`);
      expect(text).toContain("'+919825044444");
      expect(text).not.toContain('Plain, Buyer');
    });
  });

  describe('CSV import', () => {
    let imp: TestUser;
    let impMembers: TeamMember[];
    const csv = [
      'Name,Mobile,Email,Budget,Location,BHK,Type,Requirement,Status,Next Follow-up,Assigned To,Remarks',
      'Kiran Joshi,98250 70001,kiran@example.com,85 L,Bopal,3 BHK,Flat,Buy,Interested,20/11/2026,,Wants east facing',
      'Meera Nair,+91-98250-70002,,1.2 Cr,Shela,4,Bungalow,Sale,New,,OWNER_EMAIL,',
      '"Patel, Nirav",9825070003,,25000,Satellite,2,Apartment,Rent,Contacted,,,',
      'Bad Phone,12345,,,,,,,,,,',
      'Bad Values,9825070004,not-an-email,lots,,ten,Castle,Swap,Maybe,31/02/2026,stranger@example.com,',
      'Kiran Again,9825070001,,,,,,,,,,duplicate in file',
      'Existing Buyer,9825070099,,,,,,,,,,already in system',
    ].join('\n');

    beforeAll(async () => {
      imp = await registerUser(t, { label: 'import', agencyName: 'Import Realty' });
      await t.prisma.subscription.update({ where: { agencyId: imp.session.activeAgencyId! }, data: { leadLimit: null } });
      impMembers = (await t.http().get('/api/v1/agencies/current/members').set(imp.auth).expect(200)).body as TeamMember[];
      await create(imp.auth, lead({ name: 'Existing Buyer', phone: '9825070099' }));
    });

    const upload = (mode: string, duplicates = 'skip', content = csv.replace('OWNER_EMAIL', imp.email)) =>
      t.http().post(`/api/v1/leads/import?mode=${mode}&duplicates=${duplicates}`).set(imp.auth).attach('file', Buffer.from(content), 'leads.csv');

    it('previews: valid rows, per-row errors and duplicates, without saving', async () => {
      const res = (await upload('preview').expect(200)).body as LeadImportResult;
      expect(res).toMatchObject({ mode: 'preview', totalRows: 7, validRows: 5, toCreate: 3, created: 0 });
      expect(res.invalid.map((i) => i.row)).toEqual([4, 5]);
      const bad = res.invalid.find((i) => i.row === 5)!.messages.join(' | ');
      for (const fragment of ['Email', 'Budget max', 'BHK', 'Property type', 'Sale/Rent', 'Status', 'Next follow-up', 'Assigned to']) {
        expect(bad).toContain(fragment);
      }
      expect(res.duplicates).toEqual([
        expect.objectContaining({ row: 6, kind: 'file' }),
        expect.objectContaining({ row: 7, kind: 'existing', existingLeadName: 'Existing Buyer' }),
      ]);
      expect((await list(imp.auth)).total).toBe(1);
    });

    it('commits, skipping duplicates, with mapped and normalised values', async () => {
      const res = (await upload('commit').expect(200)).body as LeadImportResult;
      expect(res).toMatchObject({ mode: 'commit', created: 3 });

      const all = (await list(imp.auth, '?sort=name&order=asc&pageSize=50')).items;
      const kiran = all.find((l) => l.name === 'Kiran Joshi')!;
      expect(kiran).toMatchObject({
        phone: '+919825070001', budgetMax: 8500000, bhk: 3, propertyType: 'APARTMENT', listingType: 'SALE',
        status: 'QUALIFIED', nextFollowUpAt: '2026-11-20T04:30:00.000Z', notes: 'Wants east facing',
      });
      const meera = all.find((l) => l.name === 'Meera Nair')!;
      expect(meera).toMatchObject({ budgetMax: 12000000, propertyType: 'BUNGALOW' });
      expect(meera.assignedUser?.id).toBe(impMembers[0]!.userId);
      expect(all.find((l) => l.name === 'Patel, Nirav')).toMatchObject({ listingType: 'RENT', budgetMax: 25000, status: 'CONTACTED' });
      expect(await t.prisma.auditLog.count({ where: { agencyId: imp.session.activeAgencyId!, action: 'leads.imported' } })).toBe(1);
    });

    it('rejects files without Name/Phone columns, non-CSV files and empty files', async () => {
      await upload('preview', 'skip', 'Foo,Bar\n1,2\n').expect(400);
      await upload('preview', 'skip', 'Name,Phone\n').expect(400);
      await t.http().post('/api/v1/leads/import?mode=preview').set(imp.auth).attach('file', Buffer.from('x'), 'leads.xlsx').expect(400);
      await t.http().post('/api/v1/leads/import?mode=preview').set(imp.auth).expect(400);
    });
  });

describe('Excel (.xlsx) import', () => {
    let xl: TestUser;
    beforeAll(async () => {
      xl = await registerUser(t, { label: 'excel', agencyName: 'Excel Realty' });
      await t.prisma.subscription.update({ where: { agencyId: xl.session.activeAgencyId! }, data: { leadLimit: null } });
    });

    const uploadXlsx = (buf: Buffer, mode = 'commit', name = 'portal-leads.xlsx') =>
      t.http().post(`/api/v1/leads/import?mode=${mode}`).set(xl.auth).attach('file', buf, name);

    it('imports a portal-style Excel sheet: numeric phones, real date cells, lakh budgets, row errors', async () => {
      const buf = await writeExcelFile([
        ['Customer Name', 'Mobile No', 'Budget', 'Locality', 'Configuration', 'Purpose', 'Follow-up Date', 'Remarks'],
        ['Kiran Joshi', 9825071001, '85 L', 'Bopal', '3 BHK', 'Buy', { value: new Date(Date.UTC(2026, 10, 20)), type: Date, format: 'dd/mm/yyyy' }, 'From 99acres'],
        ['Meera Nair', 919825071002, 12000000, 'Shela', 4, 'Sale', null, null],
        [null, null, null, null, null, null, null, null],
        ['Bad Row', 12345, 'lots', null, null, null, null, null],
      ]).toBuffer();

      const preview = (await uploadXlsx(buf, 'preview').expect(200)).body as LeadImportResult;
      expect(preview).toMatchObject({ totalRows: 3, validRows: 2, toCreate: 2 }); // blank row skipped
      expect(preview.invalid[0]).toMatchObject({ row: 3, name: 'Bad Row' });

      const res = (await uploadXlsx(buf).expect(200)).body as LeadImportResult;
      expect(res.created).toBe(2);
      const all = (await list(xl.auth, '?sort=name&order=asc')).items;
      expect(all.find((l) => l.name === 'Kiran Joshi')).toMatchObject({
        phone: '+919825071001', budgetMax: 8500000, bhk: 3, preferredLocation: 'Bopal', listingType: 'SALE',
        nextFollowUpAt: '2026-11-20T04:30:00.000Z', notes: 'From 99acres',
      });
      expect(all.find((l) => l.name === 'Meera Nair')).toMatchObject({ phone: '+919825071002', budgetMax: 12000000, bhk: 4 });
    });

    it('detects the real type from the content (xlsx renamed to .csv still works)', async () => {
      const buf = await writeExcelFile([['Name', 'Phone'], ['Renamed File', '9825071010']]).toBuffer();
      const res = (await uploadXlsx(buf, 'preview', 'leads.csv').expect(200)).body as LeadImportResult;
      expect(res.validRows).toBe(1);
    });

    it('rejects old .xls files, zip bombs and corrupt workbooks with clear messages', async () => {
      const xls = await uploadXlsx(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), 'preview', 'old.xls').expect(400);
      expect(xls.body.message).toContain('.xls) are not supported');
      const disguisedXls = await uploadXlsx(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), 'preview', 'old.xlsx').expect(400);
      expect(disguisedXls.body.message).toContain('.xls) are not supported');

      const bomb = Buffer.from(zipSync({ 'xl/worksheets/sheet1.xml': new Uint8Array(30 * 1024 * 1024) }, { level: 9 }));
      const bombRes = await uploadXlsx(bomb, 'preview').expect(400);
      expect(bombRes.body.message).toContain('too large or unusual');

      await uploadXlsx(Buffer.from('PK broken', 'latin1'), 'preview').expect(400);
      expect((await list(xl.auth)).total).toBe(2); // nothing new saved
    });
  });

  describe('plan lead limit (enforced by the API)', () => {
    it('blocks creating and importing beyond the limit', async () => {
      const small = await registerUser(t, { label: 'small', agencyName: 'Small Realty' });
      await t.prisma.subscription.update({ where: { agencyId: small.session.activeAgencyId! }, data: { leadLimit: 2 } });
      await create(small.auth, lead());
      const importRes = await t
        .http()
        .post('/api/v1/leads/import?mode=commit')
        .set(small.auth)
        .attach('file', Buffer.from('Name,Phone\nA One,9825080001\nB Two,9825080002\n'), 'l.csv')
        .expect(403);
      expect(importRes.body).toMatchObject({ code: 'LEAD_LIMIT_REACHED' });
      await create(small.auth, lead());
      const res = await t.http().post('/api/v1/leads').set(small.auth).send(lead()).expect(403);
      expect(res.body).toMatchObject({ code: 'LEAD_LIMIT_REACHED' });
      expect((await list(small.auth)).total).toBe(2);
    });
  });
});
