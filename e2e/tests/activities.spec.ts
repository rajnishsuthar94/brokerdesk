import { expect, test } from '@playwright/test';
import { register, uniqueEmail } from '../support/flows';

/**
 * Critical flows 6 & 7: schedule a follow-up and a site visit, then work them
 * (mark done with the next follow-up, record the visit's feedback) and see the
 * dashboard and reminder bell reflect it.
 */
test('schedule and complete a follow-up, then schedule and record a site visit from a match', async ({ page }) => {
  await page.goto('/register');
  await register(page, { name: 'Ramesh Patel', email: uniqueEmail('activity'), agencyName: 'Bopal Realty' });
  await expect(page).toHaveURL(/\/dashboard$/);

  // A property and a buyer who fits it.
  await page.goto('/properties/new');
  await page.getByLabel('Title').fill('Applewoods 3 BHK');
  await page.getByLabel('BHK').selectOption('3');
  await page.getByLabel('Price').fill('85 L');
  await page.getByLabel('Area / locality').fill('Shela');
  await page.getByRole('button', { name: 'Add property' }).click();
  await expect(page.getByTestId('property-title')).toHaveText('Applewoods 3 BHK');

  await page.goto('/leads/new');
  await page.getByLabel('Buyer name').fill('Amit Mehta');
  await page.getByLabel('Mobile number').fill('98250 12345');
  await page.getByLabel('Property type').selectOption('APARTMENT');
  await page.getByLabel('BHK').selectOption('3');
  await page.getByLabel('Preferred location').fill('Shela');
  await page.getByLabel('Budget up to').fill('90 L');
  await page.getByRole('button', { name: 'Add lead' }).click();
  await expect(page.getByTestId('lead-name')).toHaveText('Amit Mehta');
  await expect(page.getByTestId('next-follow-up')).toContainText('not set');

  // ── Flow 6: schedule a follow-up ──────────────────────────────────────────
  await page.getByTestId('schedule-follow-up').click();
  const form = page.getByRole('form', { name: 'Schedule a follow-up' });
  await form.getByRole('button', { name: 'Tomorrow 11 AM' }).click();
  await form.getByLabel('What to do (optional)').fill('Share Applewoods brochure');
  await form.getByRole('button', { name: 'Save follow-up' }).click();
  await expect(page.getByText('Follow-up scheduled', { exact: true })).toBeVisible();

  const followUp = page.getByTestId('follow-up-item').first();
  await expect(followUp).toContainText('Tomorrow, 11:00 AM');
  await expect(followUp).toContainText('Upcoming');
  await expect(followUp).toContainText('Share Applewoods brochure');
  await expect(page.getByTestId('next-follow-up')).toContainText('11:00 AM');
  await expect(page.getByText(/Follow-up scheduled for .*: Share Applewoods brochure/)).toBeVisible();

  // Mark it done and schedule the next one in the same step.
  await followUp.getByRole('button', { name: 'Mark done' }).click();
  await followUp.getByLabel('What happened? (optional)').fill('Interested, wants to visit');
  await followUp.getByLabel('Schedule the next follow-up').check();
  await followUp.getByRole('button', { name: 'In 3 days' }).click();
  await followUp.getByRole('button', { name: 'Mark done' }).click();
  await expect(page.getByText('Done — next follow-up scheduled')).toBeVisible();
  await expect(page.getByTestId('follow-up-item').filter({ hasText: 'Upcoming' })).toHaveCount(1);
  await expect(page.getByTestId('follow-up-item').filter({ hasText: /Done/ })).toHaveCount(1);
  await expect(page.getByText('Follow-up done: Interested, wants to visit')).toBeVisible();

  // ── Flow 7: schedule a site visit from the match ──────────────────────────
  const match = page.getByTestId('property-match').first();
  await expect(match).toContainText('Applewoods 3 BHK');
  await match.getByTestId('match-schedule-visit').click();
  await expect(page).toHaveURL(/\/site-visits\/new\?/);
  await expect(page.getByTestId('visit-lead-selected')).toContainText('Amit Mehta');
  await expect(page.getByTestId('visit-property-selected')).toContainText('Applewoods 3 BHK');
  await page.getByRole('button', { name: 'Tomorrow 11 AM' }).click();
  await page.getByLabel('Notes (optional)').fill('Meet at the society gate');
  await page.getByRole('button', { name: 'Schedule visit' }).click();

  // Back on the lead: the visit is listed and the lead moved to "Site Visit".
  await expect(page.getByTestId('lead-name')).toHaveText('Amit Mehta');
  await expect(page.getByText('Site visit scheduled for Amit Mehta')).toBeVisible();
  const visit = page.getByTestId('site-visit-item').first();
  await expect(visit).toContainText('Applewoods 3 BHK');
  await expect(visit).toContainText('Scheduled');
  await expect(visit).toContainText('Tomorrow, 11:00 AM');
  await expect(page.getByTestId('status-select')).toHaveValue('SITE_VISIT');
  await expect(visit.getByRole('link', { name: 'Send visit reminder to Amit Mehta on WhatsApp' })).toHaveAttribute('href', /^https:\/\/wa\.me\/919825012345\?text=/);

  // The dashboard counts it, and the Site visits page lets us record the visit.
  await page.goto('/dashboard');
  await expect(page.getByTestId('kpi-visits')).toContainText('1');
  await expect(page.getByTestId('kpi-total-leads')).toContainText('1');

  await page.goto('/site-visits');
  const row = page.getByTestId('site-visit-item').first();
  await row.getByRole('button', { name: 'Visit done' }).click();
  await row.getByLabel("Buyer's feedback (optional)").fill('Liked the layout, wants a better price');
  await row.getByRole('button', { name: 'Save visit' }).click();
  await expect(page.getByText('Visit recorded')).toBeVisible();
  await expect(page.getByTestId('visits-empty')).toBeVisible();
  await page.getByRole('link', { name: 'Past & cancelled' }).click();
  await expect(page.getByTestId('site-visit-item').first()).toContainText('Visited');
  await expect(page.getByTestId('site-visit-item').first()).toContainText('Liked the layout');
});

test('the reminder bell counts overdue follow-ups and opens the overdue list', async ({ page }) => {
  await page.goto('/register');
  await register(page, { name: 'Kavya Shah', email: uniqueEmail('bell'), agencyName: 'Gota Homes' });
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId('reminders-bell')).toHaveAttribute('aria-label', 'Reminders: nothing due');

  // A lead created with a first follow-up already in the past (e.g. imported late).
  await page.goto('/leads/new');
  await page.getByLabel('Buyer name').fill('Priya Iyer');
  await page.getByLabel('Mobile number').fill('94260 55667');
  await page.getByLabel('First follow-up (IST)').fill('2026-01-05T10:00');
  await page.getByRole('button', { name: 'Add lead' }).click();
  await expect(page.getByTestId('lead-name')).toHaveText('Priya Iyer');
  await expect(page.getByTestId('follow-up-item').first()).toContainText('Overdue');

  await page.goto('/dashboard');
  await expect(page.getByTestId('kpi-overdue')).toContainText('Needs attention');
  await expect(page.getByTestId('reminders-count')).toHaveText('1');
  await page.getByTestId('reminders-bell').click();
  await expect(page).toHaveURL(/\/follow-ups\?view=overdue$/);
  await expect(page.getByTestId('follow-up-item').first()).toContainText('Priya Iyer');
});
