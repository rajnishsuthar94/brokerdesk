import { type ConsoleMessage, expect, test } from '@playwright/test';
import { register, uniqueEmail } from '../support/flows';

/**
 * The production build, served with the deployment's security headers:
 * the app works under the strict CSP (no violations), is installable (manifest),
 * registers its service worker, opens offline from the cached app shell, and the
 * service worker never caches API data.
 */
test('production build: CSP-clean, installable, works offline, never caches API data', async ({ page, context }) => {
  const problems: string[] = [];
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() === 'error' && /Content Security Policy|Refused to/i.test(m.text())) problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(e.message));

  const res = await page.goto('/register');
  const csp = res?.headers()['content-security-policy'] ?? '';
  expect(csp).toContain("script-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(res?.headers()['x-frame-options']).toBe('DENY');

  // A real flow under the CSP: register, see charts on the dashboard, open a lead form.
  await register(page, { name: 'Sanjay Desai', email: uniqueEmail('pwa'), agencyName: 'Satellite Estates' });
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId('kpis')).toBeVisible();
  await expect(page.locator('bd-column-chart').first()).toBeVisible();
  // Styles are applied (the stylesheet is not blocked): the primary button has the brand background.
  await page.goto('/leads/new');
  const bg = await page.getByRole('button', { name: 'Add lead' }).evaluate((b) => getComputedStyle(b).backgroundColor);
  expect(bg).not.toBe('rgba(0, 0, 0, 0)');

  // Installable: manifest with icons, served fresh.
  const manifest = await page.request.get('/manifest.webmanifest');
  expect(manifest.headers()['cache-control']).toBe('no-cache');
  const m = (await manifest.json()) as { name: string; start_url: string; display: string; icons: { sizes: string; purpose: string }[] };
  expect(m).toMatchObject({ name: 'BrokerDesk', start_url: '/dashboard', display: 'standalone' });
  expect(m.icons.map((i) => `${i.sizes}:${i.purpose}`)).toEqual(['192x192:any', '512x512:any', '512x512:maskable']);
  expect((await page.request.get('/icons/icon-512.png')).ok()).toBe(true);
  expect((await page.request.get('/ngsw-worker.js')).headers()['cache-control']).toBe('no-cache');

  // The service worker registers (after the app is stable) and controls the page.
  await page.goto('/dashboard');
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state ?? 'none'), { timeout: 60_000 }).toBe('activated');
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), { timeout: 30_000 }).toBe(true);

  // The service worker caches the app shell only — never API responses (tenant data).
  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      urls.push(...(await cache.keys()).map((r) => new URL(r.url).pathname));
    }
    return urls;
  });
  expect(cached.some((u) => u.endsWith('.js'))).toBe(true);
  expect(cached.filter((u) => u.startsWith('/api/'))).toEqual([]);

  // Offline: the app shell still opens and says it's offline.
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('offline-banner')).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByTestId('offline-banner')).toBeHidden();

  expect(problems).toEqual([]);
});
