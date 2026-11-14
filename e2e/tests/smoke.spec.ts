import { expect, test } from '@playwright/test';

test('the API and database are reachable through the web origin', async ({ request }) => {
  const res = await request.get('/api/v1/health');
  expect(res.status()).toBe(200);
  expect((await res.json()) as { details: { database: { status: string } } }).toMatchObject({
    details: { database: { status: 'up' } },
  });
});

test('signed-out visitors are sent to the login page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
});
