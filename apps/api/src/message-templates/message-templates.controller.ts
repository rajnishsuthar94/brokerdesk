import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { MessageTemplateView } from '@brokerdesk/shared-types';
import { Roles, Tenant } from '../common/auth/auth.decorators.js';
import type { TenantContext } from '../common/auth/auth.types.js';
import { requestMeta } from '../common/http/request-meta.js';
import { MemberRole } from '../generated/prisma/enums.js';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/template.dto.js';
import { MessageTemplatesService } from './message-templates.service.js';

const uuid = new ParseUUIDPipe({ version: 'all' });

@ApiTags('message templates')
@ApiBearerAuth()
@Controller('message-templates')
export class MessageTemplatesController {
  constructor(private readonly templates: MessageTemplatesService) {}

  @Get()
  list(@Tenant() ctx: TenantContext): Promise<MessageTemplateView[]> {
    return this.templates.list(ctx);
  }

  @Post()
  @Roles(MemberRole.OWNER, MemberRole.ADMIN)
  create(@Tenant() ctx: TenantContext, @Body() dto: CreateTemplateDto, @Req() req: Request): Promise<MessageTemplateView> {
    return this.templates.create(ctx, dto, requestMeta(req));
  }

  /** Adds the starter templates the agency doesn't have yet. Declared before :id. */
  @Post('defaults')
  @Roles(MemberRole.OWNER, MemberRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  addDefaults(@Tenant() ctx: TenantContext, @Req() req: Request): Promise<MessageTemplateView[]> {
    return this.templates.addDefaults(ctx, requestMeta(req));
  }

  @Patch(':id')
  @Roles(MemberRole.OWNER, MemberRole.ADMIN)
  update(@Tenant() ctx: TenantContext, @Param('id', uuid) id: string, @Body() dto: UpdateTemplateDto, @Req() req: Request): Promise<MessageTemplateView> {
    return this.templates.update(ctx, id, dto, requestMeta(req));
  }

  @Delete(':id')
  @Roles(MemberRole.OWNER, MemberRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Tenant() ctx: TenantContext, @Param('id', uuid) id: string, @Req() req: Request): Promise<void> {
    return this.templates.remove(ctx, id, requestMeta(req));
  }
}
