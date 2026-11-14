import { expect, test } from '@playwright/test';
import { register, uniqueEmail } from '../support/flows';

test('a buyer fills in the public enquiry form and the owner sees a new lead', async ({ page, browser }) => {
  // Owner signs up and opens "Get leads online".
  await page.goto('/register');
  await register(page, { name: 'Ramesh Patel', email: uniqueEmail('capture'), agencyName: 'Sabarmati Realty' });
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/leads');
  await page.getByTestId('get-leads-online').click();
  await expect(page.getByRole('heading', { name: 'Get leads online' })).toBeVisible();
  await expect(page.getByTestId('enquiry-qr')).toBeVisible();
  const url = await page.getByTestId('enquiry-url').inputValue();
  expect(url).toMatch(/\/enquire\/sabarmati-realty-[0-9a-f]{8}$/);

  // A buyer (separate, signed-out browser) scans the QR code and submits.
  const buyerContext = await browser.newContext();
  const buyer = await buyerContext.newPage();
  await buyer.goto(new URL(url).pathname + '?ref=qr');
  await expect(buyer.getByTestId('agency-name')).toHaveText('Sabarmati Realty');
  await buyer.getByLabel('Your name').fill('Kiran Joshi');
  await buyer.getByLabel('Mobile number').fill('98250 66001');
  await buyer.getByLabel('BHK').selectOption('3');
  await buyer.getByLabel('Preferred area').fill('Bopal');
  await buyer.getByLabel('Budget (up to)').fill('85 L');
  await buyer.getByRole('button', { name: 'Send enquiry' }).click();
  await expect(buyer.getByText('Please tick the box so the agency can contact you')).toBeVisible();
  await buyer.getByRole('checkbox').check();
  await buyer.getByRole('button', { name: 'Send enquiry' }).click();
  await expect(buyer.getByTestId('enquiry-thanks')).toContainText('Thank you, Kiran Joshi!');
  await buyerContext.close();

  // The owner sees it as a new lead with the right source and history.
  await page.goto('/leads');
  const row = page.getByTestId('lead-row').filter({ visible: true }).filter({ hasText: 'Kiran Joshi' });
  await expect(row).toHaveCount(1);
  await row.getByText('Kiran Joshi').click();
  await expect(page.getByTestId('lead-name')).toHaveText('Kiran Joshi');
  await expect(page.getByText('Enquiry form / QR')).toBeVisible();
  await expect(page.getByText('₹85,00,000')).toBeVisible();
  await expect(page.getByTestId('activity').first()).toContainText('online form (QR code)');

  // Switching the form off makes the link unavailable.
  await page.goto('/leads/capture');
  await page.getByRole('button', { name: 'Switch off' }).click();
  await expect(page.getByText('Your enquiry form is switched off')).toBeVisible();
  const visitor = await browser.newPage();
  await visitor.goto(new URL(url).pathname);
  await expect(visitor.getByText('Enquiry form unavailable')).toBeVisible();
  await visitor.close();
});
