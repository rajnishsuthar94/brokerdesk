import { randomUUID } from 'node:crypto';
import { HAS_TEST_DB, type TestApp, createTestApp } from './utils/test-app.js';

/**
 * Deny-by-default regression test: enumerates EVERY registered route and
 * checks that, without a token, only the intended public endpoints answer.
 * A new controller that forgets authentication fails this test.
 */
const PUBLIC_ROUTES = new Set([
  'GET /api/v1/health',
  'GET /api/v1/health/live',
  'POST /api/v1/auth/register',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/refresh',
  'POST /api/v1/auth/logout',
  'POST /api/v1/auth/forgot-password',
  'POST /api/v1/auth/reset-password',
  'POST /api/v1/invitations/preview',
  'GET /api/v1/public/enquiry/:slug',
  'POST /api/v1/public/enquiry/:slug',
  // Signed, expiring URL — the signature is the credential (tested in properties e2e).
  'GET /api/v1/media/:a/:b/:file',
]);

interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
}

describe.skipIf(!HAS_TEST_DB)('Route protection (every route, e2e)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t?.close();
  });

  function routes(): { method: string; path: string }[] {
    const express = t.app.getHttpAdapter().getInstance() as { router?: { stack: Layer[] } };
    const stack = express.router?.stack ?? [];
    return stack.flatMap((l) =>
      l.route ? Object.keys(l.route.methods).filter((m) => m !== '_all').map((m) => ({ method: m.toUpperCase(), path: l.route!.path })) : [],
    );
  }

  it('finds the application routes', () => {
    const all = routes().map((r) => `${r.method} ${r.path}`);
    expect(all.length).toBeGreaterThan(60);
    expect(all).toContain('GET /api/v1/leads');
    expect(all).toContain('GET /api/v1/reports');
  });

  it('every non-public route rejects requests without a token (401)', async () => {
    const unprotected: string[] = [];
    for (const { method, path } of routes()) {
      const key = `${method} ${path}`;
      if (PUBLIC_ROUTES.has(key)) continue;
      const url = path.replace(/:[A-Za-z]+/g, randomUUID()).replace(/\*[A-Za-z]+/g, 'x');
      const res = await t.http()[method.toLowerCase() as 'get' | 'post' | 'patch' | 'put' | 'delete'](url).send({});
      if (res.status !== 401) unprotected.push(`${key} → ${res.status}`);
    }
    expect(unprotected).toEqual([]);
  });

  it('the public allow-list only contains routes that exist', () => {
    const all = new Set(routes().map((r) => `${r.method} ${r.path}`));
    expect([...PUBLIC_ROUTES].filter((r) => !all.has(r))).toEqual([]);
  });
});
