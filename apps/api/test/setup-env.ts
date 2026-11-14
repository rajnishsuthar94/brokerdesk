/**
 * Test environment, applied before any module is imported. Values are set
 * explicitly so a developer's .env can never point tests at a real database
 * (the ConfigModule's .env files never override variables already set).
 *
 * Database-backed suites run only when TEST_DATABASE_URL is available
 * (environment or repo-root .env); see test/test-env.ts.
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TEST_JWT_SECRET, resolveTestDatabaseUrl } from './test-env.js';

const testDbUrl = resolveTestDatabaseUrl();

process.env['NODE_ENV'] = 'test';
process.env['DATABASE_URL'] = testDbUrl ?? 'mysql://test:test@127.0.0.1:3306/brokerdesk_test';
process.env['HAS_TEST_DB'] = testDbUrl ? 'true' : 'false';
process.env['SWAGGER_ENABLED'] = 'false';
process.env['CORS_ORIGINS'] = '';
process.env['JWT_ACCESS_SECRET'] = TEST_JWT_SECRET;
process.env['JWT_ACCESS_TTL_SECONDS'] = '900';
process.env['REFRESH_COOKIE_SECURE'] = 'false';
process.env['MAIL_DRIVER'] = 'none';
process.env['APP_BASE_URL'] = 'http://localhost:4200';
// Rate limiting is exercised by a dedicated test with its own low limit.
process.env['AUTH_THROTTLE_LIMIT'] = '100000';
// The public enquiry form limit is exercised by a dedicated test.
process.env['PUBLIC_ENQUIRY_THROTTLE_LIMIT'] = '100000';
// Uploaded files go to a throwaway folder, never the developer's storage/.
process.env['STORAGE_LOCAL_DIR'] = join(tmpdir(), 'brokerdesk-test-storage');
