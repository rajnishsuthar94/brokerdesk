import { type INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppConfigService } from './config/app-config.service.js';

export const API_PREFIX = 'api';
export const API_DEFAULT_VERSION = '1';

/**
 * Cross-cutting HTTP configuration shared by `main.ts` and the e2e tests,
 * so tests exercise exactly the same pipeline as production.
 */
export function setupApp(app: INestApplication): void {
  const config = app.get(AppConfigService);
  const expressApp = app as NestExpressApplication;

  // Behind nginx / a load balancer, trust N proxy hops so req.ip is the real client
  // (needed for rate limiting and audit logs). 0 = trust nothing.
  expressApp.set('trust proxy', config.get('TRUST_PROXY_HOPS'));
  expressApp.disable('x-powered-by');

  app.use(
    helmet({
      // The API serves JSON only; Swagger UI needs inline scripts/styles in dev.
      contentSecurityPolicy: config.isProduction ? undefined : false,
      hsts: config.isProduction,
    }),
  );

  // Parses the HttpOnly refresh-token cookie (only sent to /api/v1/auth/*).
  app.use(cookieParser());

  // The browser app is served from the same origin in production (nginx proxies
  // /api), so CORS is only needed for explicitly configured extra origins.
  const origins = config.get('CORS_ORIGINS');
  app.enableCors({
    origin: origins.length > 0 ? [...origins] : false,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-BrokerDesk-Client'],
    maxAge: 600,
  });

  app.setGlobalPrefix(API_PREFIX);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: API_DEFAULT_VERSION });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: false,
    }),
  );

  app.enableShutdownHooks();
}
