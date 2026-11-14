import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorService,
  type HealthCheckResult,
} from '@nestjs/terminus';
import { Public } from '../common/auth/auth.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Max time the readiness probe waits for MySQL before reporting it down. */
export const DATABASE_PING_TIMEOUT_MS = 3000;

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicators: HealthIndicatorService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Readiness: the API can serve traffic (process up + database reachable).
   * Returns 503 when a dependency is down. Use for load balancers / k8s readiness.
   */
  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness check (includes database connectivity)' })
  @ApiServiceUnavailableResponse({ description: 'A dependency (e.g. MySQL) is unavailable' })
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      () =>
        this.indicators
          .check('database')
          .attempt(() => this.prisma.ping())
          .withTimeout(DATABASE_PING_TIMEOUT_MS),
    ]);
  }

  /**
   * Liveness: the Node process is running and the event loop responds.
   * Never touches the database, so a DB outage does not trigger container restarts.
   */
  @Get('live')
  @HealthCheck()
  @ApiOperation({ summary: 'Liveness check (process only, no dependencies)' })
  live(): Promise<HealthCheckResult> {
    return this.health.check([() => this.indicators.check('api').up()]);
  }
}
