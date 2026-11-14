import { JwtService } from '@nestjs/jwt';
import type { SessionResponse } from '@brokerdesk/shared-types';
import { REFRESH_REUSE_GRACE_MS } from '../src/auth/refresh-token.service.js';
import { hashToken } from '../src/common/crypto/tokens.js';
import { TEST_JWT_SECRET } from './test-env.js';
import {
  CLIENT_HEADER,
  HAS_TEST_DB,
  PASSWORD,
  type TestApp,
  cookieHeader,
  createTestApp,
  refreshCookieFrom,
  registerUser,
  uniqueEmail,
} from './utils/test-app.js';

describe.skipIf(!HAS_TEST_DB)('Authentication (e2e, MySQL)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t?.close();
  });

  describe('register', () => {
    it('creates user, agency (OWNER), FREE subscription and a secure refresh cookie', async () => {
      const email = uniqueEmail('Owner');
      const res = await t
        .http()
        .post('/api/v1/auth/register')
        .send({ name: '  Ramesh   Patel ', email: email.toUpperCase(), phone: '98250 12345', password: PASSWORD, agencyName: 'Shela Homes' })
        .expect(201);
      const session = res.body as SessionResponse;

      expect(session.user).toMatchObject({ name: 'Ramesh Patel', email: email.toLowerCase(), phone: '+919825012345' });
      expect(session.memberships).toEqual([expect.objectContaining({ agencyName: 'Shela Homes', role: 'OWNER' })]);
      expect(session.activeAgencyId).toBe(session.memberships[0]!.agencyId);
      expect(session.expiresIn).toBe(900);

      const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('bd_rt='))!;
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Strict/i);
      expect(cookie).toMatch(/Path=\/api\/v1\/auth/);

      const user = await t.prisma.user.findUniqueOrThrow({ where: { email: email.toLowerCase() } });
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
      const sub = await t.prisma.subscription.findUniqueOrThrow({ where: { agencyId: session.activeAgencyId! } });
      expect(sub).toMatchObject({ plan: 'FREE', leadLimit: 25, userLimit: 1 });
      // Only the hash of the refresh token is stored.
      const stored = await t.prisma.refreshToken.findFirstOrThrow({ where: { userId: user.id } });
      expect(stored.tokenHash).toBe(hashToken(refreshCookieFrom(res)));
      expect(await t.prisma.auditLog.count({ where: { actorUserId: user.id, action: 'auth.register' } })).toBe(1);
    });

    it('allows registering without an agency (to accept an invitation later)', async () => {
      const res = await t.http().post('/api/v1/auth/register').send({ name: 'Kavya', email: uniqueEmail('kavya'), password: PASSWORD }).expect(201);
      expect((res.body as SessionResponse).memberships).toEqual([]);
      expect((res.body as SessionResponse).activeAgencyId).toBeNull();
    });

    it('rejects a duplicate email regardless of case', async () => {
      const u = await registerUser(t, { label: 'dup', agencyName: 'Dup Realty' });
      await t.http().post('/api/v1/auth/register').send({ name: 'Again', email: u.email.toUpperCase(), password: PASSWORD }).expect(409);
    });

    it.each([
      ['weak password', { password: 'password' }],
      ['short password', { password: 'ab1' }],
      ['invalid mobile', { phone: '12345' }],
      ['foreign mobile', { phone: '+44 7911 123456' }],
      ['invalid email', { email: 'not-an-email' }],
      ['unexpected field (mass assignment)', { role: 'OWNER' }],
      ['client-supplied agencyId', { agencyId: '01a1da72-78d5-71c0-aa6a-15a74916629b' }],
    ])('rejects %s with 400', async (_label, override) => {
      await t
        .http()
        .post('/api/v1/auth/register')
        .send({ name: 'X Y', email: uniqueEmail('bad'), password: PASSWORD, ...override })
        .expect(400);
    });
  });

  describe('login', () => {
    it('returns the same 401 for unknown email and wrong password', async () => {
      const u = await registerUser(t, { label: 'login', agencyName: 'Login Realty' });
      const wrong = await t.http().post('/api/v1/auth/login').send({ email: u.email, password: 'Wrong@1234' }).expect(401);
      const unknown = await t.http().post('/api/v1/auth/login').send({ email: uniqueEmail('nobody'), password: 'Wrong@1234' }).expect(401);
      expect((wrong.body as { message: string }).message).toBe((unknown.body as { message: string }).message);
      expect(await t.prisma.auditLog.count({ where: { action: 'auth.login_failed' } })).toBeGreaterThanOrEqual(2);
    });

    it('logs in with any email casing and refuses deactivated users', async () => {
      const u = await registerUser(t, { label: 'case', agencyName: 'Case Realty' });
      await t.http().post('/api/v1/auth/login').send({ email: u.email.toUpperCase(), password: PASSWORD }).expect(200);

      await t.prisma.user.update({ where: { email: u.email }, data: { isActive: false } });
      await t.http().post('/api/v1/auth/login').send({ email: u.email, password: PASSWORD }).expect(401);
      // An already-issued access token stops working too.
      await t.http().get('/api/v1/auth/me').set(u.auth).expect(401);
    });
  });

  describe('access tokens', () => {
    it('protects routes by default and accepts a valid bearer token', async () => {
      const u = await registerUser(t, { label: 'me', agencyName: 'Me Realty' });
      await t.http().get('/api/v1/auth/me').expect(401);
      const me = await t.http().get('/api/v1/auth/me').set(u.auth).expect(200);
      expect(me.body).toMatchObject({ user: { email: u.email }, activeAgencyId: u.session.activeAgencyId });
    });

    it('rejects tampered, foreign-secret, expired and alg=none tokens', async () => {
      const u = await registerUser(t, { label: 'jwt', agencyName: 'JWT Realty' });
      const [h, p, s] = u.session.accessToken.split('.') as [string, string, string];
      const tamperedPayload = Buffer.from(
        JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url').toString()), sub: 'someone-else' }),
      ).toString('base64url');
      const jwt = new JwtService();
      const opts = { issuer: 'brokerdesk-api', audience: 'brokerdesk-web' };
      const claims = { sub: u.session.user.id, aid: u.session.activeAgencyId, typ: 'access' };
      const none = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${p}.`;

      for (const token of [
        `${h}.${tamperedPayload}.${s}`,
        jwt.sign(claims, { ...opts, secret: 'x'.repeat(40) }),
        jwt.sign(claims, { ...opts, secret: TEST_JWT_SECRET, expiresIn: -10 }),
        jwt.sign({ ...claims, typ: 'refresh' }, { ...opts, secret: TEST_JWT_SECRET }),
        none,
        'garbage',
      ]) {
        await t.http().get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
      }
    });
  });

  describe('refresh token rotation', () => {
    it('requires the client header (CSRF defence) and a cookie', async () => {
      const u = await registerUser(t, { label: 'csrf', agencyName: 'CSRF Realty' });
      await t.http().post('/api/v1/auth/refresh').set('Cookie', cookieHeader(u.refreshToken)).expect(400);
      await t.http().post('/api/v1/auth/refresh').set(CLIENT_HEADER).expect(401);
    });

    it('rotates the token and issues a new access token', async () => {
      const u = await registerUser(t, { label: 'rotate', agencyName: 'Rotate Realty' });
      const res = await t.http().post('/api/v1/auth/refresh').set(CLIENT_HEADER).set('Cookie', cookieHeader(u.refreshToken)).expect(200);
      const next = refreshCookieFrom(res);
      expect(next).not.toBe(u.refreshToken);
      expect((res.body as SessionResponse).accessToken).toEqual(expect.any(String));

      const old = await t.prisma.refreshToken.findUniqueOrThrow({ where: { tokenHash: hashToken(u.refreshToken) } });
      expect(old.revokedAt).not.toBeNull();
      expect(old.replacedById).not.toBeNull();
    });

    it('treats an immediate replay as a tab race (401 REFRESH_RACE) without revoking the session', async () => {
      const u = await registerUser(t, { label: 'race', agencyName: 'Race Realty' });
      const first = await t.http().post('/api/v1/auth/refresh').set(CLIENT_HEADER).set('Cookie', cookieHeader(u.refreshToken)).expect(200);
      const replay = await t.http().post('/api/v1/auth/refresh').set(CLIENT_HEADER).set('Cookie', cookieHeader(u.refreshToken)).expect(401);
      expect((replay.body as { code?: string }).code).toBe('REFRESH_RACE');
      // The legitimately rotated token still works.
      await t.http().post('/api/v1/auth/refresh').set(CLIENT_HEADER).set('Cookie', cookieHeader(refreshCookieFrom(first))).expect(200);
    });

    it('detects reuse of an old token and revokes the whole family', async () => {
      const u = await registerUser(t, { label: 'reuse', agencyName: 'Reuse Realty' });
      const first = await t.http().post('/api/v1/auth/refresh').set(CLIENT_HEADER).set('Cookie', cookieHeader(u.refreshToken)).expect(200);
      const current = refreshCookieFrom(first);

      // Simulate the stolen token being replayed after the grace window.
      await t.prisma.refreshToken.update({
        where: { tokenHash: hashToken(u.refreshToken) },
        data: { revokedAt: new Date(Date.now() - REFRESH_REUSE_GRACE_MS - 1000) },
      });
      await t.http().post('/api/v1/auth/refresh').set(CLIENT_HEADER).set('Cookie', cookieHeader(u.refreshToken)).expect(401);

      // The attacker's replay also kills the legitimate, newer token.
      await t.http().post('/api/v1/auth/refresh').set(CLIENT_HEADER).set('Cookie', cookieHeader(current)).expect(401);
      expect(await t.prisma.auditLog.count({ where: { actorUserId: u.session.user.id, action: 'auth.refresh_reuse_detected' } })).toBe(1);
    });

    it('rejects expired refresh tokens', async () => {
      const u = await registerUser(t, { label: 'exp', agencyName: 'Exp Realty' });
      await t.prisma.refreshToken.update({ where: { tokenHash: hashToken(u.refreshToken) }, data: { expiresAt: new Date(Date.now() - 1000) } });
      await t.http().post('/api/v1/auth/refresh').set(CLIENT_HEADER).set('Cookie', cookieHeader(u.refreshToken)).expect(401);
    });
  });

  it('logout revokes the refresh token and clears the cookie', async () => {
    const u = await registerUser(t, { label: 'logout', agencyName: 'Logout Realty' });
    const res = await t.http().post('/api/v1/auth/logout').set(CLIENT_HEADER).set('Cookie', cookieHeader(u.refreshToken)).expect(204);
    expect((res.headers['set-cookie'] as unknown as string[]).join(';')).toMatch(/bd_rt=;/);
    await t.http().post('/api/v1/auth/refresh').set(CLIENT_HEADER).set('Cookie', cookieHeader(u.refreshToken)).expect(401);
  });

  describe('password reset', () => {
    it('answers 202 for unknown emails without sending anything', async () => {
      const email = uniqueEmail('ghost');
      await t.http().post('/api/v1/auth/forgot-password').send({ email }).expect(202);
      await expect(t.mail.waitForLink(email, 300)).rejects.toThrow();
    });

    it('resets the password once, signs out all devices, and keeps only the newest link valid', async () => {
      const u = await registerUser(t, { label: 'reset', agencyName: 'Reset Realty' });

      await t.http().post('/api/v1/auth/forgot-password').send({ email: u.email }).expect(202);
      const firstLink = await t.mail.waitForLink(u.email);
      t.mail.sent.length = 0;
      await t.http().post('/api/v1/auth/forgot-password').send({ email: u.email }).expect(202);
      const link = await t.mail.waitForLink(u.email);
      const tokenOf = (l: string): string => new URL(l).searchParams.get('token')!;
      expect(link).toMatch(/^http:\/\/localhost:4200\/reset-password\?token=/);

      // The older link was invalidated by the newer request.
      await t.http().post('/api/v1/auth/reset-password').send({ token: tokenOf(firstLink), password: 'NewPass@2026' }).expect(400);
      await t.http().post('/api/v1/auth/reset-password').send({ token: tokenOf(link), password: 'NewPass@2026' }).expect(204);
      await t.http().post('/api/v1/auth/reset-password').send({ token: tokenOf(link), password: 'Other@2026' }).expect(400);

      await t.http().post('/api/v1/auth/login').send({ email: u.email, password: PASSWORD }).expect(401);
      await t.http().post('/api/v1/auth/login').send({ email: u.email, password: 'NewPass@2026' }).expect(200);
      await t.http().post('/api/v1/auth/refresh').set(CLIENT_HEADER).set('Cookie', cookieHeader(u.refreshToken)).expect(401);
    });
  });

  it('change-password verifies the current password and signs out other devices', async () => {
    const u = await registerUser(t, { label: 'chg', agencyName: 'Chg Realty' });
    await t.http().post('/api/v1/auth/change-password').set(u.auth).send({ currentPassword: 'Wrong@123', newPassword: 'Fresh@2026' }).expect(400);
    const res = await t.http().post('/api/v1/auth/change-password').set(u.auth).send({ currentPassword: PASSWORD, newPassword: 'Fresh@2026' }).expect(200);
    await t.http().post('/api/v1/auth/refresh').set(CLIENT_HEADER).set('Cookie', cookieHeader(u.refreshToken)).expect(401);
    await t.http().post('/api/v1/auth/refresh').set(CLIENT_HEADER).set('Cookie', cookieHeader(refreshCookieFrom(res))).expect(200);
  });

  it('updates the profile with a normalised phone and can clear it', async () => {
    const u = await registerUser(t, { label: 'profile' });
    const res = await t.http().patch('/api/v1/users/me').set(u.auth).send({ name: 'Hiral  Desai', phone: '+91-98980-11122' }).expect(200);
    expect(res.body).toMatchObject({ name: 'Hiral Desai', phone: '+919898011122' });
    const cleared = await t.http().patch('/api/v1/users/me').set(u.auth).send({ phone: '' }).expect(200);
    expect((cleared.body as { phone: string | null }).phone).toBeNull();
    await t.http().patch('/api/v1/users/me').set(u.auth).send({ email: 'x@y.z' }).expect(400);
  });
});

describe.skipIf(!HAS_TEST_DB)('Authentication rate limiting (e2e, MySQL)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({ AUTH_THROTTLE_LIMIT: 3, AUTH_THROTTLE_TTL_SECONDS: 60 });
  });
  afterAll(async () => {
    await t?.close();
  });

  it('returns 429 after too many login attempts from one IP', async () => {
    const body = { email: uniqueEmail('brute'), password: 'Guess@1234' };
    for (let i = 0; i < 3; i++) await t.http().post('/api/v1/auth/login').send(body).expect(401);
    await t.http().post('/api/v1/auth/login').send(body).expect(429);
  });
});
