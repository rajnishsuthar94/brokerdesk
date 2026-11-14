import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { TeamMember } from '@brokerdesk/shared-types';
import { Roles, Tenant } from '../common/auth/auth.decorators.js';
import type { TenantContext } from '../common/auth/auth.types.js';
import { requestMeta } from '../common/http/request-meta.js';
import { MemberRole } from '../generated/prisma/enums.js';
import { ChangeRoleDto } from './dto/agency.dto.js';
import { MembersService } from './members.service.js';

@ApiTags('team')
@ApiBearerAuth()
@Controller('agencies/current/members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  /** All roles may view the team (needed to assign leads later). */
  @Get()
  list(@Tenant() ctx: TenantContext): Promise<TeamMember[]> {
    return this.members.list(ctx);
  }

  @Patch(':memberId')
  @Roles(MemberRole.OWNER, MemberRole.ADMIN)
  changeRole(
    @Tenant() ctx: TenantContext,
    @Param('memberId', new ParseUUIDPipe({ version: 'all' })) memberId: string,
    @Body() dto: ChangeRoleDto,
    @Req() req: Request,
  ): Promise<TeamMember> {
    return this.members.changeRole(ctx, memberId, dto.role, requestMeta(req));
  }

  @Delete(':memberId')
  @Roles(MemberRole.OWNER, MemberRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Tenant() ctx: TenantContext,
    @Param('memberId', new ParseUUIDPipe({ version: 'all' })) memberId: string,
    @Req() req: Request,
  ): Promise<void> {
    return this.members.remove(ctx, memberId, requestMeta(req));
  }
}
