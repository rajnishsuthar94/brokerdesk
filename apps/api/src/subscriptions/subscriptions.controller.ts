import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { SubscriptionSummary } from '@brokerdesk/shared-types';
import { Roles, Tenant } from '../common/auth/auth.decorators.js';
import type { TenantContext } from '../common/auth/auth.types.js';
import { requestMeta } from '../common/http/request-meta.js';
import { MemberRole } from '../generated/prisma/enums.js';
import { UpgradeRequestDto } from './dto/upgrade-request.dto.js';
import { SubscriptionsService } from './subscriptions.service.js';

@ApiTags('subscription')
@ApiBearerAuth()
@Controller('subscription')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  /** Plan, status, limits in force, usage and the plan catalogue. */
  @Get()
  summary(@Tenant() ctx: TenantContext): Promise<SubscriptionSummary> {
    return this.subscriptions.summary(ctx);
  }

  /** Ask for an upgrade (no online payment): audited and emailed to the sales contact. */
  @Post('upgrade-request')
  @Roles(MemberRole.OWNER, MemberRole.ADMIN)
  @HttpCode(HttpStatus.ACCEPTED)
  async requestUpgrade(@Tenant() ctx: TenantContext, @Body() dto: UpgradeRequestDto, @Req() req: Request): Promise<{ ok: true }> {
    await this.subscriptions.requestUpgrade(ctx, dto.plan, dto.note, requestMeta(req));
    return { ok: true };
  }
}
