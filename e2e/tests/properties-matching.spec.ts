import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { register, uniqueEmail } from '../support/flows';

/** Critical flows 4 & 5: add a property (with a photo), then match it with a lead. */
test('add a property with a photo and see it matched to a buyer', async ({ page }) => {
  await page.goto('/register');
  await register(page, { name: 'Ramesh Patel', email: uniqueEmail('props'), agencyName: 'Shela Homes' });
  await expect(page).toHaveURL(/\/dashboard$/);

  // Add a property.
  await page.goto('/properties');
  await expect(page.getByTestId('properties-empty')).toContainText('No properties yet');
  await page.getByTestId('add-property').click();
  await page.getByLabel('Title').fill('3 BHK in Shela near Club O7');
  await page.getByLabel('BHK').selectOption('3');
  await page.getByLabel('Price').fill('85 L');
  await expect(page.getByText('= ₹85,00,000')).toBeVisible();
  await page.getByLabel('Area / locality').fill('Shela');
  await page.getByLabel('Project / society').fill('Applewoods');
  await page.getByLabel('Owner phone').fill('98255 11223');
  await page.getByRole('button', { name: 'Add property' }).click();

  await expect(page.getByTestId('property-title')).toHaveText('3 BHK in Shela near Club O7');
  await expect(page.getByTestId('property-price')).toContainText('₹85 L');

  // Upload a photo; it becomes the cover and is served via a signed URL.
  const photo = await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#7aa37a' } }).jpeg().toBuffer();
  await page.getByTestId('photo-input').setInputFiles({ name: 'front.jpg', mimeType: 'image/jpeg', buffer: photo });
  await expect(page.getByText('1 photo added')).toBeVisible();
  const photoTile = page.getByTestId('photo').first();
  await expect(photoTile).toContainText('Cover');
  await expect(photoTile.locator('img')).toHaveAttribute('src', /^\/api\/v1\/media\/.+\.webp\?exp=\d+&sig=/);
  const loaded = await photoTile.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
  expect(loaded).toBe(true);

  // Add a buyer whose requirement fits.
  await page.goto('/leads/new');
  await page.getByLabel('Buyer name').fill('Amit Mehta');
  await page.getByLabel('Mobile number').fill('98250 12345');
  await page.getByLabel('Property type').selectOption('APARTMENT');
  await page.getByLabel('BHK').selectOption('3');
  await page.getByLabel('Preferred location').fill('Shela, Bopal');
  await page.getByLabel('Budget up to').fill('90 L');
  await page.getByRole('button', { name: 'Add lead' }).click();
  await expect(page.getByTestId('lead-name')).toHaveText('Amit Mehta');

  // The lead page shows the property as a match, with reasons and a WhatsApp share.
  const match = page.getByTestId('property-match').first();
  await expect(match).toContainText('3 BHK in Shela near Club O7');
  await expect(match).toContainText('100%');
  await expect(match.getByRole('listitem').filter({ hasText: 'Budget' })).toContainText('✓');
  await expect(match.getByRole('link', { name: 'Send to Amit Mehta on WhatsApp' })).toHaveAttribute('href', /^https:\/\/wa\.me\/919825012345\?text=/);

  // And the property page shows the buyer.
  await match.getByRole('link', { name: '3 BHK in Shela near Club O7' }).click();
  await expect(page.getByTestId('lead-match').first()).toContainText('Amit Mehta');
});
