import sharp from 'sharp';
import type { LeadMatch, LeadView, Paginated, PropertyMatch, PropertyView } from '@brokerdesk/shared-types';
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

/** A real JPEG carrying GPS coordinates in its EXIF data, like a phone photo. */
async function phonePhoto(width = 3000, height = 2000): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#88aa66' } })
    .jpeg({ quality: 70 })
    .withExif({
      IFD0: { Make: 'TestPhone', Model: 'X1' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '23/1 1/1 30/1', GPSLongitudeRef: 'E', GPSLongitude: '72/1 34/1 0/1' },
    })
    .toBuffer();
}

const property = (o: Record<string, unknown> = {}): Record<string, unknown> => ({
  title: '3 BHK in Shela, near Club O7',
  propertyType: 'APARTMENT',
  listingType: 'SALE',
  projectName: 'Applewoods Sorrel',
  location: 'Shela',
  price: 8500000,
  bhk: 3,
  area: 1650,
  areaUnit: 'SQFT',
  ownerName: 'Mahesh Joshi',
  ownerPhone: '98255 11223',
  ...o,
});

describe.skipIf(!HAS_TEST_DB)('Properties, images & matching (e2e, MySQL)', () => {
  let t: TestApp;
  let owner: TestUser;
  let agencyId: string;
  let agentAuth: Auth;
  let agentUserId: string;

  const create = async (auth: Auth, body = property()): Promise<PropertyView> =>
    (await t.http().post('/api/v1/properties').set(auth).send(body).expect(201)).body as PropertyView;
  const list = async (auth: Auth, q = ''): Promise<Paginated<PropertyView>> =>
    (await t.http().get(`/api/v1/properties${q}`).set(auth).expect(200)).body as Paginated<PropertyView>;

  beforeAll(async () => {
    t = await createTestApp();
    owner = await registerUser(t, { label: 'propowner', agencyName: 'Property Realty' });
    agencyId = owner.session.activeAgencyId!;
    await setSeatLimit(t, agencyId, 10);
    await t.prisma.subscription.update({ where: { agencyId }, data: { leadLimit: null } });
    const agent = await registerUser(t, { label: 'propagent' });
    agentAuth = await addMember(t, owner, agent, 'AGENT');
    agentUserId = agent.session.user.id;
  });
  afterAll(async () => {
    await t?.close();
  });

  describe('CRUD & permissions', () => {
    it('creates a property with Ahmedabad defaults and normalised owner phone', async () => {
      const p = await create(owner.auth);
      expect(p).toMatchObject({
        price: 8500000, city: 'Ahmedabad', availabilityStatus: 'AVAILABLE', parking: 0,
        ownerPhone: '+919825511223', images: [], coverImageUrl: null, assignedUser: null,
      });
    });

    it('accepts a landline owner number', async () => {
      expect((await create(owner.auth, property({ ownerPhone: '079-2650 1234' }))).ownerPhone).toBe('079-2650 1234');
    });

    it.each([
      ['missing title', { title: undefined }],
      ['missing price', { price: undefined }],
      ['zero price', { price: 0 }],
      ['bad type', { propertyType: 'CASTLE' }],
      ['agency injection', { agencyId: '01a1da72-78d5-71c0-aa6a-15a74916629b' }],
      ['deletedAt injection', { deletedAt: '2020-01-01' }],
    ])('rejects %s', async (_l, o) => {
      await t.http().post('/api/v1/properties').set(owner.auth).send(property(o)).expect(400);
    });

    it("agents see the whole inventory, edit only their own listings, and can't delete", async () => {
      const ownersListing = await create(owner.auth, property({ title: 'Owner listing in Bopal', location: 'Bopal' }));
      const agentsListing = await create(agentAuth, property({ title: 'Agent listing in Gota', location: 'Gota' }));
      expect(agentsListing.assignedUser?.id).toBe(agentUserId);

      expect((await list(agentAuth, '?pageSize=100')).items.map((p) => p.id)).toEqual(expect.arrayContaining([ownersListing.id, agentsListing.id]));
      await t.http().patch(`/api/v1/properties/${agentsListing.id}`).set(agentAuth).send({ price: 4200000 }).expect(200);
      await t.http().patch(`/api/v1/properties/${ownersListing.id}`).set(agentAuth).send({ price: 1 }).expect(403);
      await t.http().patch(`/api/v1/properties/${agentsListing.id}`).set(agentAuth).send({ assignedUserId: owner.session.user.id }).expect(403);
      await t.http().delete(`/api/v1/properties/${agentsListing.id}`).set(agentAuth).expect(403);
      await t.http().post(`/api/v1/properties/${ownersListing.id}/images`).set(agentAuth).attach('files', await phonePhoto(), 'a.jpg').expect(403);
    });

    it('managers can assign to members only, archive, and soft-delete', async () => {
      const p = await create(owner.auth);
      const outsider = await registerUser(t, { label: 'propoutsider', agencyName: 'Elsewhere' });
      await t.http().patch(`/api/v1/properties/${p.id}`).set(owner.auth).send({ assignedUserId: outsider.session.user.id }).expect(400);
      await t.http().patch(`/api/v1/properties/${p.id}`).set(owner.auth).send({ assignedUserId: agentUserId }).expect(200);

      await t.http().patch(`/api/v1/properties/${p.id}`).set(owner.auth).send({ availabilityStatus: 'ARCHIVED' }).expect(200);
      expect((await list(owner.auth, '?pageSize=100')).items.map((x) => x.id)).not.toContain(p.id);
      expect((await list(owner.auth, '?availabilityStatus=ARCHIVED')).items.map((x) => x.id)).toContain(p.id);

      await t.http().delete(`/api/v1/properties/${p.id}`).set(owner.auth).expect(204);
      await t.http().get(`/api/v1/properties/${p.id}`).set(owner.auth).expect(404);
      expect(await t.prisma.auditLog.count({ where: { action: 'property.deleted', entityId: p.id } })).toBe(1);
    });
  });

  describe('search & filters', () => {
    let f: TestUser;
    beforeAll(async () => {
      f = await registerUser(t, { label: 'propfilter', agencyName: 'Filter Props' });
      await create(f.auth, property({ title: 'Flat A', location: 'Shela', price: 8000000, bhk: 3 }));
      await create(f.auth, property({ title: 'Flat B', location: 'Bopal', price: 6000000, bhk: 2, ownerPhone: '9898012345' }));
      await create(f.auth, property({ title: 'Rental C', listingType: 'RENT', location: 'Prahlad Nagar', price: 28000, bhk: 2 }));
      await create(f.auth, property({ title: 'Villa D', propertyType: 'BUNGALOW', location: 'Bopal', price: 25000000, bhk: 4, projectName: 'Shaligram' }));
    });
    const titles = async (q: string): Promise<string[]> => (await list(f.auth, q)).items.map((p) => p.title);

    it('searches title, location, project, owner phone', async () => {
      expect((await titles('?search=bopal')).sort()).toEqual(['Flat B', 'Villa D']);
      expect(await titles('?search=shaligram')).toEqual(['Villa D']);
      expect(await titles('?search=98980%2012345')).toEqual(['Flat B']);
    });

    it('filters by listing type, type, BHK and price range; sorts by price', async () => {
      expect(await titles('?listingType=RENT')).toEqual(['Rental C']);
      expect(await titles('?propertyType=BUNGALOW')).toEqual(['Villa D']);
      expect((await titles('?bhk=2&bhk=3&listingType=SALE')).sort()).toEqual(['Flat A', 'Flat B']);
      expect(await titles('?minPrice=5000000&maxPrice=9000000&sort=price&order=asc')).toEqual(['Flat B', 'Flat A']);
    });
  });

  describe('images', () => {
    let p: PropertyView;
    beforeAll(async () => {
      p = await create(owner.auth, property({ title: 'Photo test' }));
    });

    it('re-encodes uploads: WebP, max 1600px, GPS/EXIF removed; served only via signed URL', async () => {
      const original = await phonePhoto();
      expect((await sharp(original).metadata()).exif).toBeDefined(); // the input really has EXIF/GPS

      const res = await t.http().post(`/api/v1/properties/${p.id}/images`).set(owner.auth)
        .attach('files', original, 'IMG_2026.jpg').attach('files', await phonePhoto(800, 600), 'second.jpg').expect(201);
      const updated = res.body as PropertyView;
      expect(updated.images).toHaveLength(2);
      expect(updated.coverImageUrl).toBe(updated.images[0]!.url);
      expect(updated.images[0]!.url).toMatch(/^\/api\/v1\/media\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp\?exp=\d+&sig=[\w-]+$/);

      const img = await t.http().get(updated.images[0]!.url).buffer(true).parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      }).expect(200);
      expect(img.headers['content-type']).toBe('image/webp');
      expect(img.headers['cache-control']).toMatch(/^private/);
      const meta = await sharp(img.body as Buffer).metadata();
      expect(meta.format).toBe('webp');
      expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(1600);
      expect(meta.exif).toBeUndefined(); // no GPS, no camera data
    });

    it('rejects non-images, disguised files and SVG; stores nothing', async () => {
      const before = await t.prisma.propertyImage.count({ where: { propertyId: p.id } });
      await t.http().post(`/api/v1/properties/${p.id}/images`).set(owner.auth).attach('files', Buffer.from('MZ fake exe'), 'photo.jpg').expect(400);
      await t.http().post(`/api/v1/properties/${p.id}/images`).set(owner.auth)
        .attach('files', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'x.svg').expect(400);
      // one good + one bad → all-or-nothing
      await t.http().post(`/api/v1/properties/${p.id}/images`).set(owner.auth)
        .attach('files', await phonePhoto(400, 300), 'ok.jpg').attach('files', Buffer.from('nope'), 'bad.png').expect(400);
      expect(await t.prisma.propertyImage.count({ where: { propertyId: p.id } })).toBe(before);
    });

    it('signed URLs cannot be tampered with or reused for other files', async () => {
      const { images } = (await t.http().get(`/api/v1/properties/${p.id}`).set(owner.auth).expect(200)).body as PropertyView;
      const [a, b] = images as [PropertyView['images'][0], PropertyView['images'][0]];
      const sigOf = (u: string): string => new URL(u, 'http://x').searchParams.get('sig')!;
      const expOf = (u: string): string => new URL(u, 'http://x').searchParams.get('exp')!;
      const path = (u: string): string => u.split('?')[0]!;

      await t.http().get(path(a.url)).expect(404); // no signature
      await t.http().get(`${path(a.url)}?exp=${expOf(a.url)}&sig=${sigOf(b.url)}`).expect(404); // other file's signature
      await t.http().get(`${path(a.url)}?exp=${Number(expOf(a.url)) + 3600}&sig=${sigOf(a.url)}`).expect(404); // extended expiry
      await t.http().get(`${path(a.url)}?exp=${Math.floor(Date.now() / 1000) - 10}&sig=${sigOf(a.url)}`).expect(404); // expired
      await t.http().get('/api/v1/media/..%2F..%2F/etc/passwd?exp=9999999999&sig=x').expect(404);
    });

    it('reorders (first = cover) and deletes photos', async () => {
      const before = (await t.http().get(`/api/v1/properties/${p.id}`).set(owner.auth)).body as PropertyView;
      const ids = before.images.map((i) => i.id);
      const reordered = (await t.http().put(`/api/v1/properties/${p.id}/images/order`).set(owner.auth).send({ imageIds: [...ids].reverse() }).expect(200)).body as PropertyView;
      expect(reordered.images.map((i) => i.id)).toEqual([...ids].reverse());
      await t.http().put(`/api/v1/properties/${p.id}/images/order`).set(owner.auth).send({ imageIds: [ids[0]] }).expect(400);

      const removed = (await t.http().delete(`/api/v1/properties/${p.id}/images/${ids[0]}`).set(owner.auth).expect(200)).body as PropertyView;
      expect(removed.images.map((i) => i.id)).toEqual([ids[1]]);
      await t.http().get(before.images[0]!.url).expect(404); // file gone
    });
  });

  describe('matching', () => {
    let m: TestUser;
    let mAgentAuth: Auth;
    let lead: LeadView;
    beforeAll(async () => {
      m = await registerUser(t, { label: 'match', agencyName: 'Match Realty' });
      await setSeatLimit(t, m.session.activeAgencyId!, 5);
      mAgentAuth = await addMember(t, m, await registerUser(t, { label: 'matchagent' }), 'AGENT');
      for (const body of [
        property({ title: 'Perfect Shela 3BHK', location: 'Shela', price: 8500000 }),
        property({ title: 'Bopal 3BHK slightly over', location: 'Bopal', price: 9300000 }),
        property({ title: 'Gota 2BHK', location: 'Gota', price: 5000000, bhk: 2 }),
        property({ title: 'Shela rental', listingType: 'RENT', location: 'Shela', price: 30000 }),
        property({ title: 'Sold Shela flat', location: 'Shela', price: 8000000, availabilityStatus: 'SOLD' }),
        property({ title: 'Way too expensive', location: 'Shela', price: 30000000 }),
      ]) await create(m.auth, body);
      lead = (await t.http().post('/api/v1/leads').set(m.auth).send({
        name: 'Amit Mehta', phone: '9825088001', listingType: 'SALE', budgetMin: 7500000, budgetMax: 9000000,
        preferredLocation: 'Shela, Bopal', bhk: 3, propertyType: 'APARTMENT',
      }).expect(201)).body as LeadView;
    });

    it('ranks properties for a lead with explanations; excludes rentals, sold and far-over-budget listings', async () => {
      const matches = (await t.http().get(`/api/v1/leads/${lead.id}/matches`).set(m.auth).expect(200)).body as PropertyMatch[];
      expect(matches.map((x) => x.property.title)).toEqual(['Perfect Shela 3BHK', 'Bopal 3BHK slightly over', 'Gota 2BHK']);
      expect(matches[0]).toMatchObject({ score: 100, missed: 0 });
      expect(matches[1]!.criteria.find((c) => c.key === 'budget')).toEqual({ key: 'budget', status: 'near', detail: '₹93 L is 3% over the ₹90 L budget' });
      expect(matches[2]!.criteria.filter((c) => c.status === 'miss').map((c) => c.key)).toEqual(['location']);
    });

    it('finds matching leads for a property, respecting agent visibility', async () => {
      const [perfect] = (await list(m.auth, '?search=Perfect')).items;
      const forOwner = (await t.http().get(`/api/v1/properties/${perfect!.id}/matches`).set(m.auth).expect(200)).body as LeadMatch[];
      expect(forOwner.map((x) => x.lead.name)).toEqual(['Amit Mehta']);
      const forAgent = (await t.http().get(`/api/v1/properties/${perfect!.id}/matches`).set(mAgentAuth).expect(200)).body as LeadMatch[];
      expect(forAgent).toEqual([]); // the lead is not assigned to the agent
      await t.http().get(`/api/v1/leads/${lead.id}/matches`).set(mAgentAuth).expect(404);
    });
  });
});
