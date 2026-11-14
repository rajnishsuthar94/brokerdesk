import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Resolves the disposable test database URL: an explicit TEST_DATABASE_URL
 * environment variable wins, otherwise the repo-root .env is consulted.
 * Only TEST_DATABASE_URL is read from the file; nothing else leaks into tests.
 */
export function resolveTestDatabaseUrl(): string | undefined {
  if (process.env['TEST_DATABASE_URL']) return process.env['TEST_DATABASE_URL'];
  const rootEnv = resolve(import.meta.dirname, '../../../.env');
  if (!existsSync(rootEnv)) return undefined;
  const parsed: Record<string, string> = {};
  loadEnv({ path: rootEnv, processEnv: parsed, quiet: true });
  return parsed['TEST_DATABASE_URL'] || undefined;
}

/** Refuses anything that does not look like a throwaway test database. */
export function assertIsTestDatabase(url: string): void {
  const name = new URL(url).pathname.replace(/^\//, '');
  if (!name.endsWith('_test')) {
    throw new Error(`Refusing to run database tests against "${name}": the database name must end in _test`);
  }
}

export const TEST_JWT_SECRET = 'test-only-jwt-secret-0123456789-abcdefghijklmnopqrstuvwxyz';
