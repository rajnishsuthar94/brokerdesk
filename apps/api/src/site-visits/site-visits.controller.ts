import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Paginated, SiteVisitView } from '@brokerdesk/shared-types';
import { Tenant } from '../common/auth/auth.decorators.js';
import type { TenantContext } from '../common/auth/auth.types.js';
import { CancelDto } from '../follow-ups/dto/follow-up.dto.js';
import { CompleteSiteVisitDto, CreateSiteVisitDto, ListSiteVisitsQueryDto, UpdateSiteVisitDto } from './dto/site-visit.dto.js';
import { SiteVisitsService } from './site-visits.service.js';

const uuid = new ParseUUIDPipe({ version: 'all' });

@ApiTags('site visits')
@ApiBearerAuth()
@Controller('site-visits')
export class SiteVisitsController {
  constructor(private readonly visits: SiteVisitsService) {}

  /** `view`: upcoming (default) | past | all. */
  @Get()
  list(@Tenant() ctx: TenantContext, @Query() q: ListSiteVisitsQueryDto): Promise<Paginated<SiteVisitView>> {
    return this.visits.list(ctx, q);
  }

  @Post()
  create(@Tenant() ctx: TenantContext, @Body() dto: CreateSiteVisitDto): Promise<SiteVisitView> {
    return this.visits.create(ctx, dto);
  }

  /** Reschedule (scheduledAt) or reassign an open visit. */
  @Patch(':id')
  update(@Tenant() ctx: TenantContext, @Param('id', uuid) id: string, @Body() dto: UpdateSiteVisitDto): Promise<SiteVisitView> {
    return this.visits.update(ctx, id, dto);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  complete(@Tenant() ctx: TenantContext, @Param('id', uuid) id: string, @Body() dto: CompleteSiteVisitDto): Promise<SiteVisitView> {
    return this.visits.complete(ctx, id, dto.feedback);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Tenant() ctx: TenantContext, @Param('id', uuid) id: string, @Body() dto: CancelDto): Promise<SiteVisitView> {
    return this.visits.cancel(ctx, id, dto.reason);
  }
}

@ApiTags('site visits')
@ApiBearerAuth()
@Controller()
export class RelatedSiteVisitsController {
  constructor(private readonly visits: SiteVisitsService) {}

  @Get('leads/:id/site-visits')
  forLead(@Tenant() ctx: TenantContext, @Param('id', uuid) id: string): Promise<SiteVisitView[]> {
    return this.visits.forLead(ctx, id);
  }

  @Get('properties/:id/site-visits')
  forProperty(@Tenant() ctx: TenantContext, @Param('id', uuid) id: string): Promise<SiteVisitView[]> {
    return this.visits.forProperty(ctx, id);
  }
}
