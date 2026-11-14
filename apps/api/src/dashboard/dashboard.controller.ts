import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { DashboardSummary, ReminderCounts } from '@brokerdesk/shared-types';
import { Tenant } from '../common/auth/auth.decorators.js';
import type { TenantContext } from '../common/auth/auth.types.js';
import { DashboardService } from './dashboard.service.js';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /** KPIs, chart data and today's reminders, scoped to the caller (agents: their own leads). */
  @Get()
  summary(@Tenant() ctx: TenantContext): Promise<DashboardSummary> {
    return this.dashboard.summary(ctx);
  }

  /** The caller's own overdue / due-today follow-ups and today's visits (header bell). Cheap; polled. */
  @Get('reminders')
  reminders(@Tenant() ctx: TenantContext): Promise<ReminderCounts> {
    return this.dashboard.reminders(ctx);
  }
}
