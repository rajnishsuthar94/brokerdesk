import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createConnection } from 'mariadb';

/**
 * The e2e API always runs against the disposable test database, never the dev one.
 * Source: TEST_DATABASE_URL env var, else the repo-root .env.
 */
export function testDatabaseUrl(): string {
  let url = process.env['TEST_DATABASE_URL'];
  const rootEnv = resolve(__dirname, '../../.env');
  if (!url && existsSync(rootEnv)) {
    const parsed: Record<string, string> = {};
    loadEnv({ path: rootEnv, processEnv: parsed, quiet: true });
    url = parsed['TEST_DATABASE_URL'];
  }
  if (!url) throw new Error('TEST_DATABASE_URL is required for e2e tests (see .env.example)');
  if (!new URL(url).pathname.endsWith('_test')) {
    throw new Error('Refusing to run e2e tests: TEST_DATABASE_URL must point at a database whose name ends in _test');
  }
  return url;
}

/**
 * Test-only shortcut for things the UI cannot do yet (plan upgrades arrive in
 * Phase 6): raise an agency's seat limit directly in the test database.
 */
export async function setSeatLimitForUser(email: string, seats: number): Promise<void> {
  const u = new URL(testDatabaseUrl());
  const conn = await createConnection({
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.slice(1),
    allowPublicKeyRetrieval: true,
  });
  try {
    await conn.query(
      `UPDATE subscriptions s
         JOIN agency_members m ON m.agency_id = s.agency_id AND m.role = 'OWNER'
         JOIN users u ON u.id = m.user_id
        SET s.user_limit = ?
      WHERE u.email = ?`,
      [seats, email],
    );
  } finally {
    await conn.end();
  }
}
