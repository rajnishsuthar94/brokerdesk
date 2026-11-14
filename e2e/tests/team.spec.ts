import { expect, test } from '@playwright/test';
import { login, logout, register, uniqueEmail } from '../support/flows';
import { setSeatLimitForUser } from '../support/test-db';

test('owner invites a colleague who joins through the link and appears in the team', async ({ page }) => {
  const ownerEmail = uniqueEmail('owner');
  const agentEmail = uniqueEmail('agent');

  // Owner registers and opens the team page.
  await page.goto('/register');
  await register(page, { name: 'Hiral Desai', email: ownerEmail, agencyName: 'Navrang Homes' });
  await expect(page).toHaveURL(/\/dashboard$/);
  // The Free plan has a single seat; upgrading via the UI arrives in Phase 6.
  await setSeatLimitForUser(ownerEmail, 3);

  await page.goto('/team');
  await page.getByLabel('Email address').fill(agentEmail);
  await page.getByRole('button', { name: 'Create invitation' }).click();
  const linkText = page.locator('p.font-mono');
  await expect(linkText).toContainText('/invite?token=');
  await expect(page.getByRole('link', { name: 'Share on WhatsApp' })).toHaveAttribute('href', /^https:\/\/wa\.me\/\?text=/);
  const inviteUrl = new URL((await linkText.textContent())!.trim());
  await expect(page.getByText('Pending invitations')).toBeVisible();
  await logout(page);

  // Colleague opens the link, creates an account (no agency), and accepts.
  await page.goto(inviteUrl.pathname + inviteUrl.search);
  await expect(page.getByRole('heading', { name: 'Join Navrang Homes' })).toBeVisible();
  await page.getByRole('link', { name: 'Create an account' }).click();
  await expect(page.getByLabel('Agency / business name')).toHaveCount(0);
  await register(page, { name: 'Sanjay Rathod', email: agentEmail });
  await page.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId('welcome')).toContainText('Navrang Homes');

  // Agents see the team but no invite controls.
  await page.goto('/team');
  await expect(page.getByTestId('team-member')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Create invitation' })).toHaveCount(0);
  await logout(page);

  // The owner now sees the colleague as an Agent and can promote them.
  await login(page, ownerEmail);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/team');
  const agentRow = page.getByTestId('team-member').filter({ hasText: 'Sanjay Rathod' });
  await agentRow.getByRole('combobox').selectOption('ADMIN');
  await expect(page.getByText('Sanjay Rathod is now Admin')).toBeVisible();
});
