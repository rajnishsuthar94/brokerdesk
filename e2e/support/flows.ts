import { type Page, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

export const PASSWORD = 'Sabarmati@2026';

export function uniqueEmail(label: string): string {
  return `${label}.${randomUUID().slice(0, 8)}@example.test`;
}

export interface NewAccount {
  readonly name: string;
  readonly email: string;
  readonly agencyName?: string;
}

/** Fills the registration form (with or without creating an agency). */
export async function register(page: Page, account: NewAccount): Promise<void> {
  await page.getByLabel('Your name').fill(account.name);
  if (account.agencyName) await page.getByLabel('Agency / business name').fill(account.agencyName);
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Mobile number').fill('98250 12345');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
}

/** Submits the login form. Callers should await the resulting URL before navigating away. */
export async function login(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
}

export async function logout(page: Page): Promise<void> {
  await page.getByTestId('profile-menu-button').click();
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login$/);
}
