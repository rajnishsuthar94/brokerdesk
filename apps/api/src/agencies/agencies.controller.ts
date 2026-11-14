import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AgencyDetails } from '@brokerdesk/shared-types';
import { AllowNoAgency, CurrentAuth, Roles, Tenant } from '../common/auth/auth.decorators.js';
import type { AuthPrincipal, TenantContext } from '../common/auth/auth.types.js';
import { requestMeta } from '../common/http/request-meta.js';
import { MemberRole } from '../generated/prisma/enums.js';
import { AgenciesService } from './agencies.service.js';
import { CreateAgencyDto, UpdateAgencyDto } from './dto/agency.dto.js';
import { MembersService } from './members.service.js';

@ApiTags('agencies')
@ApiBearerAuth()
@Controller('agencies')
export class AgenciesController {
  constructor(
    private readonly agencies: AgenciesService,
    private readonly members: MembersService,
  ) {}

  /** Create another agency; the caller becomes its OWNER. Call /auth/switch-agency to use it. */
  @Post()
  @AllowNoAgency()
  create(@CurrentAuth() auth: AuthPrincipal, @Body() dto: CreateAgencyDto, @Req() req: Request): Promise<AgencyDetails> {
    return this.agencies.create(auth.userId, dto, requestMeta(req));
  }

  @Get('current')
  getCurrent(@Tenant() ctx: TenantContext): Promise<AgencyDetails> {
    return this.agencies.getCurrent(ctx);
  }

  @Patch('current')
  @Roles(MemberRole.OWNER, MemberRole.ADMIN)
  updateCurrent(@Tenant() ctx: TenantContext, @Body() dto: UpdateAgencyDto, @Req() req: Request): Promise<AgencyDetails> {
    return this.agencies.updateCurrent(ctx, dto, requestMeta(req));
  }

  /** Leave the current agency (the last owner cannot leave). */
  @Post('current/leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  leave(@Tenant() ctx: TenantContext, @Req() req: Request): Promise<void> {
    return this.members.leave(ctx, requestMeta(req));
  }
}
