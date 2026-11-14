import { expect, test } from '@playwright/test';
import { register, uniqueEmail } from '../support/flows';

/**
 * Responsive check: with real data on screen, no main page scrolls sideways
 * at 360 px (the narrowest common Android width) — tables scroll inside their
 * own containers instead.
 */
test('no page overflows horizontally at 360 px', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Phone layout check');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 360, height: 760 });

  await page.goto('/register');
  await register(page, { name: 'Bhavesh Thakkar', email: uniqueEmail('narrow'), agencyName: 'Vastrapur Lake View Properties' });
  await expect(page).toHaveURL(/\/dashboard$/);

  // Some data with long text, so pages render their real layouts.
  await page.goto('/properties/new');
  await page.getByLabel('Title').fill('Spacious 4 BHK penthouse with private terrace garden near Sindhu Bhavan Road');
  await page.getByLabel('BHK').selectOption('4');
  await page.getByLabel('Price').fill('3.25 Cr');
  await page.getByLabel('Area / locality').fill('Sindhu Bhavan Road, Bodakdev');
  await page.getByRole('button', { name: 'Add property' }).click();
  await expect(page.getByTestId('property-title')).toBeVisible();
  const propertyUrl = page.url();

  await page.goto('/leads/new');
  await page.getByLabel('Buyer name').fill('Hiteshkumar Jayantilal Brahmbhatt');
  await page.getByLabel('Mobile number').fill('98790 12345');
  await page.getByLabel('Property type').selectOption('APARTMENT');
  await page.getByLabel('BHK').selectOption('4');
  await page.getByLabel('Budget up to').fill('3.5 Cr');
  await page.getByLabel('First follow-up (IST)').fill('2026-01-05T10:00');
  await page.getByRole('button', { name: 'Add lead' }).click();
  await expect(page.getByTestId('lead-name')).toBeVisible();
  const leadUrl = page.url();
  await page.getByTestId('property-match').first().getByTestId('match-schedule-visit').click();
  await page.getByRole('button', { name: 'Tomorrow 11 AM' }).click();
  await page.getByRole('button', { name: 'Schedule visit' }).click();
  await expect(page.getByTestId('site-visit-item').first()).toBeVisible();

  const pages = [
    '/dashboard', '/leads', leadUrl, '/leads/import', '/properties', propertyUrl, '/matching',
    '/follow-ups?view=overdue', '/site-visits', '/site-visits/new', '/reports', '/plan', '/templates', '/team', '/settings',
  ];
  const overflowing: string[] = [];
  for (const url of pages) {
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    // Compare with the fixed 360 px: on mobile emulation window.innerWidth grows with
    // over-wide content (the browser zooms out), so it can't be the yardstick.
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
    if (scroll > 361) overflowing.push(`${new URL(url, 'http://x').pathname}: ${scroll}px`);
  }
  expect(overflowing).toEqual([]);
});
