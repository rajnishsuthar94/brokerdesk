import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FollowUpView, Paginated } from '@brokerdesk/shared-types';
import { Tenant } from '../common/auth/auth.decorators.js';
import type { TenantContext } from '../common/auth/auth.types.js';
import { CancelDto, CompleteFollowUpDto, CreateFollowUpDto, ListFollowUpsQueryDto, UpdateFollowUpDto } from './dto/follow-up.dto.js';
import { FollowUpsService } from './follow-ups.service.js';

const uuid = new ParseUUIDPipe({ version: 'all' });

@ApiTags('follow-ups')
@ApiBearerAuth()
@Controller('follow-ups')
export class FollowUpsController {
  constructor(private readonly followUps: FollowUpsService) {}

  /** `view`: today | overdue | upcoming | completed | cancelled | all (IST days). */
  @Get()
  list(@Tenant() ctx: TenantContext, @Query() q: ListFollowUpsQueryDto): Promise<Paginated<FollowUpView>> {
    return this.followUps.list(ctx, q);
  }

  @Post()
  create(@Tenant() ctx: TenantContext, @Body() dto: CreateFollowUpDto): Promise<FollowUpView> {
    return this.followUps.create(ctx, dto);
  }

  /** Reschedule (dueAt), edit notes or reassign a pending follow-up. */
  @Patch(':id')
  update(@Tenant() ctx: TenantContext, @Param('id', uuid) id: string, @Body() dto: UpdateFollowUpDto): Promise<FollowUpView> {
    return this.followUps.update(ctx, id, dto);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  complete(@Tenant() ctx: TenantContext, @Param('id', uuid) id: string, @Body() dto: CompleteFollowUpDto): Promise<FollowUpView> {
    return this.followUps.complete(ctx, id, dto);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Tenant() ctx: TenantContext, @Param('id', uuid) id: string, @Body() dto: CancelDto): Promise<FollowUpView> {
    return this.followUps.cancel(ctx, id, dto.reason);
  }
}

@ApiTags('follow-ups')
@ApiBearerAuth()
@Controller('leads')
export class LeadFollowUpsController {
  constructor(private readonly followUps: FollowUpsService) {}

  /** Full follow-up history of one lead. */
  @Get(':id/follow-ups')
  forLead(@Tenant() ctx: TenantContext, @Param('id', uuid) id: string): Promise<FollowUpView[]> {
    return this.followUps.forLead(ctx, id);
  }
}
