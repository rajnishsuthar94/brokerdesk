import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { testDatabaseUrl } from './test-db';

/** Applies migrations to the e2e (test) database before the servers start. */
export default function globalSetup(): void {
  execSync('npx prisma migrate deploy', {
    cwd: resolve(__dirname, '../../apps/api'),
    env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
    stdio: 'pipe',
  });
}
