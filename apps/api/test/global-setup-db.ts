import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createConnection } from 'mariadb';
import { assertIsTestDatabase, resolveTestDatabaseUrl } from './test-env.js';

/**
 * Runs once before the e2e suites: applies migrations to the test database and
 * empties every table, so each run starts from a clean, fully migrated schema.
 * Does nothing when no TEST_DATABASE_URL is configured.
 */
export default async function setup(): Promise<void> {
  const url = resolveTestDatabaseUrl();
  if (!url) {
    console.warn('\n[e2e] TEST_DATABASE_URL not set – database suites will be skipped.\n');
    return;
  }
  assertIsTestDatabase(url);

  execSync('npx prisma migrate deploy', {
    cwd: resolve(import.meta.dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });

  const u = new URL(url);
  const conn = await createConnection({
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.slice(1),
    allowPublicKeyRetrieval: true,
  });
  try {
    const rows = await conn.query<{ TABLE_NAME: string }[]>(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME <> '_prisma_migrations'",
    );
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const { TABLE_NAME } of rows) await conn.query(`TRUNCATE TABLE \`${TABLE_NAME}\``);
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  } finally {
    await conn.end();
  }
}
