import { expect, test } from '@playwright/test';
import writeExcelFile from 'write-excel-file/node';
import { register, uniqueEmail } from '../support/flows';

/** Critical flow 3: add a lead, then work it (history, status, edit, search, duplicates). */
test('add a lead and work it through the pipeline', async ({ page, isMobile }) => {
  await page.goto('/register');
  await register(page, { name: 'Ramesh Patel', email: uniqueEmail('leads'), agencyName: 'Shela Homes' });
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto('/leads');
  await expect(page.getByTestId('leads-empty')).toContainText('No leads yet');

  // Add a lead the way a broker would type it.
  await page.getByTestId('add-lead').click();
  await page.getByLabel('Buyer name').fill('Amit Mehta');
  await page.getByLabel('Mobile number').fill('98250 12345');
  await page.getByLabel('Property type').selectOption('APARTMENT');
  await page.getByLabel('BHK').selectOption('3');
  await page.getByLabel('Preferred location').fill('Shela');
  await page.getByLabel('Budget from').fill('75 L');
  await page.getByLabel('Budget up to').fill('90 L');
  await expect(page.getByText('= ₹90,00,000')).toBeVisible();
  await page.getByLabel('Priority').selectOption('HIGH');
  await page.getByLabel('Lead source').selectOption('PROPERTY_PORTAL');
  await page.getByRole('button', { name: 'Add lead' }).click();

  // Detail page.
  await expect(page.getByTestId('lead-name')).toHaveText('Amit Mehta');
  await expect(page.getByText('+91 98250 12345')).toBeVisible();
  await expect(page.getByText('₹75,00,000 – ₹90,00,000')).toBeVisible();
  await expect(page.getByRole('link', { name: 'WhatsApp Amit Mehta' })).toHaveAttribute('href', 'https://wa.me/919825012345');
  await expect(page.getByRole('link', { name: 'Call Amit Mehta' })).toHaveAttribute('href', 'tel:+919825012345');

  // Log a call and change the status: both appear in the history.
  await page.getByLabel('What happened?').fill('Spoke for 10 min, wants east-facing');
  await page.getByRole('button', { name: 'Add to history' }).click();
  await expect(page.getByTestId('activity').first()).toContainText('Call · Spoke for 10 min, wants east-facing');
  await page.getByTestId('status-select').selectOption('QUALIFIED');
  await expect(page.getByTestId('activity').first()).toContainText('Status changed from New to Qualified');

  // Edit.
  await page.getByRole('link', { name: 'Edit lead' }).click();
  await page.getByLabel('Budget up to').fill('1 Cr');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('₹75,00,000 – ₹1,00,00,000')).toBeVisible();

  // Back in the list: visible and searchable by phone digits.
  await page.getByRole('link', { name: '‹ All leads' }).click();
  await page.getByLabel('Search leads').fill('12345');
  await expect(page.getByTestId('lead-row').filter({ visible: true })).toHaveCount(1);
  await expect(page.getByTestId('lead-row').filter({ visible: true }).first()).toContainText('Amit Mehta');
  await page.getByLabel('Search leads').fill('nobody-matches');
  await expect(page.getByText('No leads match your search')).toBeVisible();

  // Adding the same number again warns about the duplicate.
  await page.goto('/leads/new');
  await page.getByLabel('Buyer name').fill('Amit Again');
  await page.getByLabel('Mobile number').fill('+91 98250-12345');
  await page.getByRole('button', { name: 'Add lead' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('A lead with this phone number already exists: Amit Mehta');
  await page.getByRole('button', { name: 'Go back' }).click();
  await expect(page).toHaveURL(/\/leads\/new$/);

  if (!isMobile) {
    // Status filter chip narrows the table.
    await page.goto('/leads');
    await page.getByRole('button', { name: 'Won', exact: true }).click();
    await expect(page.getByTestId('leads-empty')).toContainText('No leads match');
  }
});

test('import leads from a CSV: preview, skip duplicates, import', async ({ page }) => {
  await page.goto('/register');
  await register(page, { name: 'Hiral Desai', email: uniqueEmail('import'), agencyName: 'Navrang Homes' });
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto('/leads/import');
  const csv = [
    'Name,Mobile,Budget,Location,BHK,Requirement,Status',
    'Kiran Joshi,98250 70001,85 L,Bopal,3 BHK,Buy,Interested',
    '"Patel, Nirav",9825070003,25000,Satellite,2,Rent,Contacted',
    'Kiran Again,9825070001,,,,,',
    'Bad Phone,12345,,,,,',
  ].join('\n');
  await page.getByLabel('Excel or CSV file (max 1 MB, 2,000 rows)').setInputFiles({
    name: 'leads.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });

  const preview = page.getByTestId('import-preview');
  await expect(preview).toBeVisible();
  await expect(page.getByTestId('to-create')).toHaveText('2');
  await expect(preview).toContainText('repeated earlier in this file');
  await expect(preview).toContainText('Row 4 Bad Phone');

  await page.getByRole('button', { name: 'Import 2 leads' }).click();
  await expect(page).toHaveURL(/\/leads$/);
  await expect(page.getByText('2 leads imported')).toBeVisible();
  await expect(page.getByTestId('lead-row').filter({ visible: true })).toHaveCount(2);
});

test('import leads straight from an Excel (.xlsx) file', async ({ page }) => {
  await page.goto('/register');
  await register(page, { name: 'Hiral Desai', email: uniqueEmail('xlsx'), agencyName: 'Excel Homes' });
  await expect(page).toHaveURL(/\/dashboard$/);

  const workbook = await writeExcelFile([
    ['Customer Name', 'Mobile No', 'Budget', 'Locality', 'Configuration'],
    ['Kiran Joshi', 9825072001, '85 L', 'Bopal', '3 BHK'],
    ['Meera Nair', 9825072002, 12000000, 'Shela', 4],
  ]).toBuffer();

  await page.goto('/leads/import');
  await page.getByLabel('Excel or CSV file (max 1 MB, 2,000 rows)').setInputFiles({
    name: 'portal-download.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: workbook,
  });
  await expect(page.getByTestId('to-create')).toHaveText('2');
  await page.getByRole('button', { name: 'Import 2 leads' }).click();
  await expect(page.getByText('2 leads imported')).toBeVisible();
  await expect(page.getByTestId('lead-row').filter({ visible: true })).toHaveCount(2);
});
