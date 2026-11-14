import { Controller, Get, Header, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { ReportSummary } from '@brokerdesk/shared-types';
import { Roles, Tenant } from '../common/auth/auth.decorators.js';
import type { TenantContext } from '../common/auth/auth.types.js';
import { requestMeta } from '../common/http/request-meta.js';
import { MemberRole } from '../generated/prisma/enums.js';
import { ReportExportQueryDto, ReportQueryDto } from './dto/report-query.dto.js';
import { ReportsService } from './reports.service.js';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** Report for an IST date range (default: this month). Agents get their own numbers. */
  @Get()
  summary(@Tenant() ctx: TenantContext, @Query() q: ReportQueryDto): Promise<ReportSummary> {
    return this.reports.summary(ctx, this.reports.range(q.from, q.to));
  }

  /** CSV of the team or sources table (owners/admins). */
  @Get('export')
  @Roles(MemberRole.OWNER, MemberRole.ADMIN)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async export(
    @Tenant() ctx: TenantContext,
    @Query() q: ReportExportQueryDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const range = this.reports.range(q.from, q.to);
    const section = q.section ?? 'team';
    const csv = await this.reports.exportCsv(ctx, range, section, requestMeta(req));
    res.setHeader('Content-Disposition', `attachment; filename="brokerdesk-${section}-${range.from}-to-${range.to}.csv"`);
    return csv;
  }
}
