import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { HealthResponse } from '@brokerdesk/shared-types';
import { AppModule } from '../src/app.module.js';
import { DATABASE_PING_TIMEOUT_MS } from '../src/health/health.controller.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';

/**
 * HTTP-level tests for the health endpoints, using the real application module and
 * the same HTTP pipeline as production (setupApp). The database is replaced by a
 * stub so these run without MySQL; see the opt-in real-database suite below.
 */
describe('Health API (e2e, stubbed database)', () => {
  let app: INestApplication<App>;
  const prismaStub = { ping: vi.fn<() => Promise<void>>(), $disconnect: vi.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    prismaStub.ping.mockReset();
  });

  it('GET /api/v1/health → 200 when the database answers', async () => {
    prismaStub.ping.mockResolvedValue(undefined);

    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    const body = res.body as HealthResponse;

    expect(body.status).toBe('ok');
    expect(body.details['database']?.status).toBe('up');
    expect(prismaStub.ping).toHaveBeenCalledOnce();
  });

  it('GET /api/v1/health → 503 when the database is unreachable', async () => {
    prismaStub.ping.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:3306'));

    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(503);
    const body = res.body as HealthResponse;

    expect(body.status).toBe('error');
    expect(body.details['database']?.status).toBe('down');
  });

  it(
    'GET /api/v1/health → 503 when the database hangs past the timeout',
    async () => {
      prismaStub.ping.mockImplementation(() => new Promise(() => undefined));

      const res = await request(app.getHttpServer()).get('/api/v1/health').expect(503);
      expect((res.body as HealthResponse).details['database']?.status).toBe('down');
    },
    DATABASE_PING_TIMEOUT_MS + 5000,
  );

  it('GET /api/v1/health/live → 200 without touching the database', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);

    expect((res.body as HealthResponse).status).toBe('ok');
    expect(prismaStub.ping).not.toHaveBeenCalled();
  });

  it('applies security headers and hides the framework', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/live');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('returns 404 for routes outside the versioned API prefix', async () => {
    await request(app.getHttpServer()).get('/health').expect(404);
  });
});

/** Runs against the real test database when TEST_DATABASE_URL is configured. */
describe.skipIf(process.env['HAS_TEST_DB'] !== 'true')('Health API (e2e, real MySQL)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('reports the database as up', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect((res.body as HealthResponse).details['database']?.status).toBe('up');
  });
});
