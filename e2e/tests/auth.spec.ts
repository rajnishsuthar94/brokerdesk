import { expect, test } from '@playwright/test';
import { PASSWORD, login, logout, register, uniqueEmail } from '../support/flows';

/** Critical flows 1 & 2: register and create an agency; log in. */
test.describe('registration and login', () => {
  test('register with a new agency, stay signed in after reload, log out, log back in', async ({ page }) => {
    const email = uniqueEmail('owner');
    await page.goto('/register');
    await register(page, { name: 'Ramesh Patel', email, agencyName: 'Shela Homes' });

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId('welcome')).toContainText('Welcome, Ramesh Patel');
    await expect(page.getByTestId('welcome')).toContainText('Shela Homes');
    await expect(page.getByTestId('db-status')).toContainText('Working');

    // The access token lives only in memory; a reload restores the session via the HttpOnly cookie.
    await page.reload();
    await expect(page.getByTestId('welcome')).toContainText('Shela Homes');
    const tokenInStorage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
    expect(tokenInStorage).not.toMatch(/eyJ[\w-]+\.[\w-]+\./); // no JWT persisted

    await logout(page);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?returnUrl=%2Fdashboard$/);

    await login(page, email);
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('wrong password shows a clear error; deep links survive the login', async ({ page }) => {
    const email = uniqueEmail('deeplink');
    await page.goto('/register');
    await register(page, { name: 'Kavya Shah', email, agencyName: 'Bopal Realty' });
    await expect(page).toHaveURL(/\/dashboard$/);
    await logout(page);

    await page.goto('/team');
    await expect(page).toHaveURL(/returnUrl=%2Fteam/);
    await login(page, email, 'Wrong@1234');
    await expect(page.getByRole('alert')).toContainText('Incorrect email or password');

    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/team$/);
    await expect(page.getByRole('heading', { name: 'Team', exact: true })).toBeVisible();
  });

  test('registration shows validation messages', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('Mobile number').fill('12345');
    await page.getByLabel('Password').fill('short');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('Enter a valid 10-digit mobile number')).toBeVisible();
    await expect(page.getByText('Use at least 8 characters with a letter and a number')).toBeVisible();
    await expect(page).toHaveURL(/\/register$/);
  });
});
