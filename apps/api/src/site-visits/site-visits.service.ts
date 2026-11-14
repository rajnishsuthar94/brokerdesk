import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ApiErrorCode, canAssignLeads, type Paginated, type SiteVisitListView, type SiteVisitView } from '@brokerdesk/shared-types';
import { MembersService } from '../agencies/members.service.js';
import type { TenantContext } from '../common/auth/auth.types.js';
import { forbidden } from '../common/http/api-errors.js';
import { formatIstDateTime, istDayRange } from '../common/utils/indian-formats.js';
import type { Prisma } from '../generated/prisma/client.js';
import { LeadActivityType, LeadStatus, SiteVisitStatus } from '../generated/prisma/enums.js';
import { leadScope } from '../leads/lead-query.js';
import { MediaUrlService } from '../media/media-url.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { propertyScope } from '../properties/property-query.js';
import type { CreateSiteVisitDto, ListSiteVisitsQueryDto, UpdateSiteVisitDto } from './dto/site-visit.dto.js';
import { siteVisitSelect, type SiteVisitRow, toSiteVisitView } from './site-visit.mapper.js';

type Db = Prisma.TransactionClient | PrismaService;

const OPEN: SiteVisitStatus[] = [SiteVisitStatus.SCHEDULED, SiteVisitStatus.RESCHEDULED];
/** Scheduling a visit moves a lead at an earlier stage to SITE_VISIT. */
const BEFORE_VISIT: LeadStatus[] = [LeadStatus.NEW, LeadStatus.CONTACTED, LeadStatus.QUALIFIED];

/** Visits visible to the caller: those whose lead the caller may see. */
export function siteVisitScope(ctx: TenantContext): Prisma.SiteVisitWhereInput {
  return { agencyId: ctx.agencyId, lead: { is: leadScope(ctx) } };
}

/** upcoming = still open, from the start of today (IST); past = everything else. */
export function siteVisitViewWhere(view: SiteVisitListView, now: Date): Prisma.SiteVisitWhereInput {
  const { start } = istDayRange(now);
  if (view === 'upcoming') return { status: { in: OPEN }, scheduledAt: { gte: start } };
  if (view === 'past') return { OR: [{ status: { notIn: OPEN } }, { scheduledAt: { lt: start } }] };
  return {};
}

@Injectable()
export class SiteVisitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly members: MembersService,
    private readonly urls: MediaUrlService,
  ) {}

  private view(row: SiteVisitRow): SiteVisitView {
    return toSiteVisitView(row, this.urls);
  }

  async list(ctx: TenantContext, q: ListSiteVisitsQueryDto): Promise<Paginated<SiteVisitView>> {
    const view = q.view ?? 'upcoming';
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 30;
    const where: Prisma.SiteVisitWhereInput = { AND: [siteVisitScope(ctx), siteVisitViewWhere(view, new Date())] };
    const orderBy: Prisma.SiteVisitOrderByWithRelationInput[] =
      view === 'upcoming' ? [{ scheduledAt: 'asc' }, { id: 'asc' }] : [{ scheduledAt: 'desc' }, { id: 'desc' }];
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.siteVisit.count({ where }),
      this.prisma.siteVisit.findMany({ where, select: siteVisitSelect, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return { items: rows.map((r) => this.view(r)), total, page, pageSize };
  }

  async forLead(ctx: TenantContext, leadId: string): Promise<SiteVisitView[]> {
    const lead = await this.prisma.lead.findFirst({ where: { id: leadId, ...leadScope(ctx) }, select: { id: true } });
    if (!lead) throw new NotFoundException('Lead not found');
    const rows = await this.prisma.siteVisit.findMany({
      where: { ...siteVisitScope(ctx), leadId },
      select: siteVisitSelect,
      orderBy: { scheduledAt: 'desc' },
      take: 100,
    });
    return rows.map((r) => this.view(r));
  }

  /** Visit history of a property (only visits of leads the caller may see). */
  async forProperty(ctx: TenantContext, propertyId: string): Promise<SiteVisitView[]> {
    const property = await this.prisma.property.findFirst({ where: { id: propertyId, ...propertyScope(ctx) }, select: { id: true } });
    if (!property) throw new NotFoundException('Property not found');
    const rows = await this.prisma.siteVisit.findMany({
      where: { ...siteVisitScope(ctx), propertyId },
      select: siteVisitSelect,
      orderBy: { scheduledAt: 'desc' },
      take: 100,
    });
    return rows.map((r) => this.view(r));
  }

  async create(ctx: TenantContext, dto: CreateSiteVisitDto): Promise<SiteVisitView> {
    return this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({
        where: { id: dto.leadId, ...leadScope(ctx) },
        select: { id: true, status: true, assignedUserId: true },
      });
      if (!lead) throw new NotFoundException('Lead not found');
      const property = await tx.property.findFirst({
        where: { id: dto.propertyId, ...propertyScope(ctx) },
        select: { id: true, title: true },
      });
      if (!property) throw new NotFoundException('Property not found');

      const assignedUserId = await this.resolveAssignee(tx, ctx, lead.id, dto.assignedUserId, lead.assignedUserId);
      const scheduledAt = new Date(dto.scheduledAt);
      const created = await tx.siteVisit.create({
        data: { agencyId: ctx.agencyId, leadId: lead.id, propertyId: property.id, assignedUserId, scheduledAt, status: SiteVisitStatus.SCHEDULED },
        select: siteVisitSelect,
      });
      await this.log(tx, ctx, lead.id, LeadActivityType.SITE_VISIT,
        `Site visit scheduled: ${property.title} on ${formatIstDateTime(scheduledAt)}${dto.notes ? `. ${dto.notes}` : ''}`);
      if (BEFORE_VISIT.includes(lead.status)) {
        await tx.lead.update({ where: { id: lead.id }, data: { status: LeadStatus.SITE_VISIT } });
        await this.log(tx, ctx, lead.id, LeadActivityType.STATUS_CHANGE, 'Status changed to Site Visit (visit scheduled)');
      }
      return this.view(created);
    });
  }

  async update(ctx: TenantContext, id: string, dto: UpdateSiteVisitDto): Promise<SiteVisitView> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.findOpen(tx, ctx, id);
      let assignedUserId: string | null | undefined;
      if (dto.assignedUserId !== undefined && dto.assignedUserId !== (current.assignedUser?.id ?? null)) {
        assignedUserId = await this.resolveAssignee(tx, ctx, current.lead.id, dto.assignedUserId, null);
      }
      const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : undefined;
      const moved = scheduledAt && scheduledAt.getTime() !== current.scheduledAt.getTime();
      const updated = await tx.siteVisit.update({
        where: { id },
        data: { scheduledAt, assignedUserId, status: moved ? SiteVisitStatus.RESCHEDULED : undefined },
        select: siteVisitSelect,
      });
      if (moved) {
        await this.log(tx, ctx, current.lead.id, LeadActivityType.SITE_VISIT,
          `Site visit to ${current.property.title} rescheduled to ${formatIstDateTime(scheduledAt)}`);
      }
      return this.view(updated);
    });
  }

  async complete(ctx: TenantContext, id: string, feedback?: string): Promise<SiteVisitView> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.findOpen(tx, ctx, id);
      const done = await tx.siteVisit.update({
        where: { id },
        data: { status: SiteVisitStatus.COMPLETED, feedback: feedback ?? null },
        select: siteVisitSelect,
      });
      await this.log(tx, ctx, current.lead.id, LeadActivityType.SITE_VISIT,
        `Visited ${current.property.title}${feedback ? `. Feedback: ${feedback}` : ''}`);
      return this.view(done);
    });
  }

  async cancel(ctx: TenantContext, id: string, reason?: string): Promise<SiteVisitView> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.findOpen(tx, ctx, id);
      const cancelled = await tx.siteVisit.update({ where: { id }, data: { status: SiteVisitStatus.CANCELLED }, select: siteVisitSelect });
      await this.log(tx, ctx, current.lead.id, LeadActivityType.SITE_VISIT,
        `Site visit to ${current.property.title} cancelled${reason ? `: ${reason}` : ''}`);
      return this.view(cancelled);
    });
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async findOpen(db: Db, ctx: TenantContext, id: string): Promise<SiteVisitRow> {
    const row = await db.siteVisit.findFirst({ where: { id, ...siteVisitScope(ctx) }, select: siteVisitSelect });
    if (!row) throw new NotFoundException('Site visit not found');
    if (!OPEN.includes(row.status)) throw new BadRequestException('This visit is already completed or cancelled.');
    return row;
  }

  private async resolveAssignee(db: Db, ctx: TenantContext, leadId: string, requested: string | null | undefined, fallback: string | null): Promise<string | null> {
    if (requested === undefined) return fallback ?? ctx.userId;
    if (!canAssignLeads(ctx.role) && requested !== ctx.userId) {
      throw forbidden(ApiErrorCode.INSUFFICIENT_ROLE, 'Only owners and admins can assign visits to others.');
    }
    if (requested === null) return null;
    await this.members.assertCanHandleLead(ctx.agencyId, requested, leadId, db);
    return requested;
  }

  private async log(tx: Prisma.TransactionClient, ctx: TenantContext, leadId: string, type: LeadActivityType, description: string): Promise<void> {
    await tx.leadActivity.create({ data: { agencyId: ctx.agencyId, leadId, userId: ctx.userId, activityType: type, description } });
  }
}
