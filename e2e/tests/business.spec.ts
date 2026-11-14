import { expect, test } from '@playwright/test';
import { register, uniqueEmail } from '../support/flows';

/** Phase 6: WhatsApp templates on a lead, reports, and the plan page (upgrade request, no payment). */
test('templates, reports and plan', async ({ page }) => {
  await page.goto('/register');
  await register(page, { name: 'Ramesh Patel', email: uniqueEmail('business'), agencyName: 'Navrangpura Realty' });
  await expect(page).toHaveURL(/\/dashboard$/);

  // Starter templates.
  await page.goto('/templates');
  await page.getByTestId('add-default-templates').click();
  await expect(page.getByText('Starter templates added')).toBeVisible();
  await expect(page.getByTestId('template')).toHaveCount(5);

  // A lead, then a template opened in WhatsApp with the placeholders filled.
  await page.goto('/leads/new');
  await page.getByLabel('Buyer name').fill('Priya Iyer');
  await page.getByLabel('Mobile number').fill('94260 55667');
  await page.getByRole('button', { name: 'Add lead' }).click();
  await expect(page.getByTestId('lead-name')).toHaveText('Priya Iyer');
  await page.getByTestId('wa-template-select').selectOption({ label: 'First contact · Thanks for your enquiry' });
  await expect(page.getByTestId('wa-preview')).toContainText('Hello Priya, thank you for your enquiry with Navrangpura Realty. I am Ramesh Patel');
  await expect(page.getByTestId('wa-open')).toHaveAttribute('href', /^https:\/\/wa\.me\/919426055667\?text=Hello%20Priya/);

  // Reports for this month include the lead; presets change the period in the URL.
  await page.goto('/reports');
  await expect(page.getByTestId('report-totals')).toContainText('New leads');
  await expect(page.getByTestId('report-totals').locator('div').first()).toContainText('1');
  await expect(page.getByTestId('team-table')).toContainText('Ramesh Patel');
  await page.getByRole('button', { name: 'Last financial year' }).click();
  await expect(page).toHaveURL(/from=\d{4}-04-01&to=\d{4}-03-31/);
  await expect(page.getByTestId('report-range')).toContainText('01/04/');
  await expect(page.getByText('No new leads in this period.').first()).toBeVisible();

  // Plan & usage, and an upgrade request (no online payment).
  await page.goto('/plan');
  await expect(page.getByTestId('current-plan')).toContainText('Free plan');
  await expect(page.getByTestId('usage-meter').first()).toContainText('1 of 25');
  await page.getByTestId('plan-card').filter({ hasText: 'Starter' }).getByRole('button', { name: 'Request upgrade' }).click();
  await page.getByLabel('Anything we should know? (optional)').fill('Want to start next week');
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByText('Request sent. Our team will contact you shortly.')).toBeVisible();
  await expect(page.getByTestId('last-request')).toBeVisible();
});
