import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_TEMPLATES,
  MAX_TEMPLATES_PER_AGENCY,
  type MessageTemplateView,
  TEMPLATE_CATEGORIES,
  type TemplateCategory,
} from '@brokerdesk/shared-types';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import type { TenantContext } from '../common/auth/auth.types.js';
import type { RequestMeta } from '../common/http/request-meta.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateTemplateDto, UpdateTemplateDto } from './dto/template.dto.js';

const select = { id: true, title: true, message: true, category: true, updatedAt: true } as const;
type Row = { id: string; title: string; message: string; category: string; updatedAt: Date };

function toView(r: Row): MessageTemplateView {
  const category = (TEMPLATE_CATEGORIES as readonly string[]).includes(r.category) ? (r.category as TemplateCategory) : 'GENERAL';
  return { id: r.id, title: r.title, message: r.message, category, updatedAt: r.updatedAt.toISOString() };
}

/** Agency-wide WhatsApp message templates. Everyone uses them; owners/admins manage them. */
@Injectable()
export class MessageTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: TenantContext): Promise<MessageTemplateView[]> {
    const rows = await this.prisma.messageTemplate.findMany({ where: { agencyId: ctx.agencyId }, select, orderBy: [{ category: 'asc' }, { title: 'asc' }] });
    return rows.map(toView);
  }

  async create(ctx: TenantContext, dto: CreateTemplateDto, meta: RequestMeta): Promise<MessageTemplateView> {
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.messageTemplate.count({ where: { agencyId: ctx.agencyId } });
      if (count >= MAX_TEMPLATES_PER_AGENCY) throw new BadRequestException(`You can keep up to ${MAX_TEMPLATES_PER_AGENCY} templates. Delete one first.`);
      await this.assertTitleFree(tx, ctx.agencyId, dto.title);
      const row = await tx.messageTemplate.create({ data: { agencyId: ctx.agencyId, title: dto.title, message: dto.message, category: dto.category }, select });
      await this.audit.record({ action: AuditAction.MESSAGE_TEMPLATE_CHANGED, agencyId: ctx.agencyId, actorUserId: ctx.userId, entityType: 'message_template', entityId: row.id, metadata: { op: 'created' }, meta }, tx);
      return toView(row);
    });
  }

  async update(ctx: TenantContext, id: string, dto: UpdateTemplateDto, meta: RequestMeta): Promise<MessageTemplateView> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.messageTemplate.findFirst({ where: { id, agencyId: ctx.agencyId }, select: { id: true, title: true } });
      if (!current) throw new NotFoundException('Template not found');
      if (dto.title && dto.title !== current.title) await this.assertTitleFree(tx, ctx.agencyId, dto.title);
      const row = await tx.messageTemplate.update({ where: { id }, data: dto, select });
      await this.audit.record({ action: AuditAction.MESSAGE_TEMPLATE_CHANGED, agencyId: ctx.agencyId, actorUserId: ctx.userId, entityType: 'message_template', entityId: id, metadata: { op: 'updated' }, meta }, tx);
      return toView(row);
    });
  }

  async remove(ctx: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.messageTemplate.deleteMany({ where: { id, agencyId: ctx.agencyId } });
      if (count === 0) throw new NotFoundException('Template not found');
      await this.audit.record({ action: AuditAction.MESSAGE_TEMPLATE_CHANGED, agencyId: ctx.agencyId, actorUserId: ctx.userId, entityType: 'message_template', entityId: id, metadata: { op: 'deleted' }, meta }, tx);
    });
  }

  /** Adds the starter templates the agency doesn't have yet (matched by title). */
  async addDefaults(ctx: TenantContext, meta: RequestMeta): Promise<MessageTemplateView[]> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.messageTemplate.findMany({ where: { agencyId: ctx.agencyId }, select: { title: true } });
      const have = new Set(existing.map((t) => t.title.toLowerCase()));
      const room = Math.max(0, MAX_TEMPLATES_PER_AGENCY - existing.length);
      const toAdd = DEFAULT_TEMPLATES.filter((t) => !have.has(t.title.toLowerCase())).slice(0, room);
      if (toAdd.length === 0) return;
      await tx.messageTemplate.createMany({ data: toAdd.map((t) => ({ agencyId: ctx.agencyId, ...t })), skipDuplicates: true });
      await this.audit.record({ action: AuditAction.MESSAGE_TEMPLATE_CHANGED, agencyId: ctx.agencyId, actorUserId: ctx.userId, entityType: 'message_template', metadata: { op: 'defaults_added', count: toAdd.length }, meta }, tx);
    });
    return this.list(ctx);
  }

  private async assertTitleFree(tx: Pick<PrismaService, 'messageTemplate'>, agencyId: string, title: string): Promise<void> {
    const clash = await tx.messageTemplate.findFirst({ where: { agencyId, title }, select: { id: true } });
    if (clash) throw new ConflictException('A template with this title already exists.');
  }
}
