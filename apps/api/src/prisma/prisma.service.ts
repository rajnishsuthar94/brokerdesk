import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { AppConfigService } from '../config/app-config.service.js';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * Application-wide Prisma client.
 *
 * Prisma 7 connects to MySQL through a driver adapter (`@prisma/adapter-mariadb`,
 * which is MySQL-compatible). The connection is opened lazily on the first query,
 * so the API can boot and report `database: down` on /health while MySQL is
 * unavailable instead of crash-looping.
 *
 * IMPORTANT (tenancy): feature services must never query tenant-owned models without
 * an `agencyId` filter derived from the authenticated membership. A tenant-scoped
 * repository helper is introduced in Phase 2.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: AppConfigService) {
    super({
      adapter: new PrismaMariaDb(config.get('DATABASE_URL')),
      log: ['warn', 'error'],
    });
  }

  /** Lightweight connectivity probe used by the health check. */
  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Database connection pool closed');
  }
}
