import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import type {
  AcceptInvitationResponse,
  CreateInvitationResponse,
  InvitationPreview,
  PendingInvitation,
} from '@brokerdesk/shared-types';
import { AllowNoAgency, CurrentAuth, Public, Roles, Tenant } from '../common/auth/auth.decorators.js';
import type { AuthPrincipal, TenantContext } from '../common/auth/auth.types.js';
import { requestMeta } from '../common/http/request-meta.js';
import { MemberRole } from '../generated/prisma/enums.js';
import { InvitationTokenDto, InviteMemberDto } from './dto/agency.dto.js';
import { InvitationsService } from './invitations.service.js';

@ApiTags('team')
@ApiBearerAuth()
@Controller('agencies/current/invitations')
@Roles(MemberRole.OWNER, MemberRole.ADMIN)
export class AgencyInvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get()
  list(@Tenant() ctx: TenantContext): Promise<PendingInvitation[]> {
    return this.invitations.listPending(ctx);
  }

  @Post()
  create(@Tenant() ctx: TenantContext, @Body() dto: InviteMemberDto, @Req() req: Request): Promise<CreateInvitationResponse> {
    return this.invitations.create(ctx, dto, requestMeta(req));
  }

  @Delete(':invitationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(
    @Tenant() ctx: TenantContext,
    @Param('invitationId', new ParseUUIDPipe({ version: 'all' })) invitationId: string,
    @Req() req: Request,
  ): Promise<void> {
    return this.invitations.revoke(ctx, invitationId, requestMeta(req));
  }
}

/**
 * Invitee-side endpoints. The token travels in the request body (not the URL path)
 * so it does not end up in access logs. Rate limited against token guessing.
 */
@ApiTags('team')
@Controller('invitations')
@UseGuards(ThrottlerGuard)
@SkipThrottle({ publicEnquiry: true })
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post('preview')
  @Public()
  @HttpCode(HttpStatus.OK)
  preview(@Body() dto: InvitationTokenDto): Promise<InvitationPreview> {
    return this.invitations.preview(dto.token);
  }

  /** Joins the agency. The logged-in user's email must match the invitation. */
  @Post('accept')
  @AllowNoAgency()
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  accept(@CurrentAuth() auth: AuthPrincipal, @Body() dto: InvitationTokenDto, @Req() req: Request): Promise<AcceptInvitationResponse> {
    return this.invitations.accept(auth, dto.token, requestMeta(req));
  }
}
