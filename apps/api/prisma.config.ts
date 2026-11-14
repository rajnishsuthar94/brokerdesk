import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Same lookup order as the API: apps/api/.env, then the shared repo-root .env.
// Variables already present in the environment are never overridden.
loadEnv({ path: ['.env', '../../.env'], quiet: true });

/**
 * Prisma 7 CLI configuration. Prisma 7 no longer reads `.env` automatically and
 * the connection URL is no longer declared in schema.prisma, so both live here.
 *
 * DATABASE_URL is only needed by commands that talk to the database
 * (migrate, db seed, studio). `prisma generate` and `prisma validate` work
 * without it, which keeps CI builds and Docker image builds DB-free.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'] ?? '',
    shadowDatabaseUrl: process.env['SHADOW_DATABASE_URL'],
  },
});
