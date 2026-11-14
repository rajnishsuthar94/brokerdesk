import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import type { EnquiryFormSettings, PublicEnquiryInfo } from '@brokerdesk/shared-types';
import { Public, Roles, Tenant } from '../common/auth/auth.decorators.js';
import type { TenantContext } from '../common/auth/auth.types.js';
import { requestMeta } from '../common/http/request-meta.js';
import { MemberRole } from '../generated/prisma/enums.js';
import { PublicEnquiryDto, UpdateEnquiryFormDto } from './dto/enquiry.dto.js';
import { EnquiriesService } from './enquiries.service.js';
import { ParseSlugPipe } from './parse-slug.pipe.js';

/**
 * Public, unauthenticated enquiry form. Rate limited per client IP
 * (PUBLIC_ENQUIRY_THROTTLE_*) and capped per agency per day.
 */
@ApiTags('enquiry form')
@Controller('public/enquiry')
@Public()
@UseGuards(ThrottlerGuard)
@SkipThrottle({ auth: true })
export class PublicEnquiryController {
  constructor(private readonly enquiries: EnquiriesService) {}

  /** Agency name/city/phone for the form header. Viewing is not rate limited. */
  @Get(':slug')
  @SkipThrottle({ publicEnquiry: true })
  info(@Param('slug', ParseSlugPipe) slug: string): Promise<PublicEnquiryInfo> {
    return this.enquiries.publicInfo(slug);
  }

  @Post(':slug')
  @HttpCode(HttpStatus.CREATED)
  async submit(
    @Param('slug', ParseSlugPipe) slug: string,
    @Body() dto: PublicEnquiryDto,
    @Req() req: Request,
  ): Promise<{ received: true }> {
    await this.enquiries.submit(slug, dto, requestMeta(req));
    return { received: true };
  }
}

/** The agency's own enquiry-form settings. Everyone may see/share the link; managers change it. */
@ApiTags('enquiry form')
@ApiBearerAuth()
@Controller('agencies/current/enquiry-form')
export class EnquiryFormSettingsController {
  constructor(private readonly enquiries: EnquiriesService) {}

  @Get()
  get(@Tenant() ctx: TenantContext): Promise<EnquiryFormSettings> {
    return this.enquiries.settings(ctx);
  }

  @Patch()
  @Roles(MemberRole.OWNER, MemberRole.ADMIN)
  update(@Tenant() ctx: TenantContext, @Body() dto: UpdateEnquiryFormDto, @Req() req: Request): Promise<EnquiryFormSettings> {
    return this.enquiries.setEnabled(ctx, dto.enabled, requestMeta(req));
  }

  @Post('reset-link')
  @Roles(MemberRole.OWNER, MemberRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  resetLink(@Tenant() ctx: TenantContext, @Req() req: Request): Promise<EnquiryFormSettings> {
    return this.enquiries.resetLink(ctx, requestMeta(req));
  }
}
