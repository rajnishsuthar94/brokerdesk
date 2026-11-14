import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ApiErrorCode, canAssignLeads, type FollowUpListView, type FollowUpView, type Paginated } from '@brokerdesk/shared-types';
import { MembersService } from '../agencies/members.service.js';
import type { TenantContext } from '../common/auth/auth.types.js';
import { forbidden } from '../common/http/api-errors.js';
import { formatIstDateTime, istDayRange } from '../common/utils/indian-formats.js';
import type { Prisma } from '../generated/prisma/client.js';
import { FollowUpStatus, LeadActivityType } from '../generated/prisma/enums.js';
import { leadScope } from '../leads/lead-query.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CompleteFollowUpDto, CreateFollowUpDto, ListFollowUpsQueryDto, UpdateFollowUpDto } from './dto/follow-up.dto.js';
import { syncNextFollowUp } from './follow-up-sync.js';
import { followUpSelect, type FollowUpRow, toFollowUpView } from './follow-up.mapper.js';

type Db = Prisma.TransactionClient | PrismaService;

/**
 * Follow-ups visible to the caller: those whose LEAD the caller may see
 * (agents: leads assigned to them). Every follow-up query starts from this.
 */
export function followUpScope(ctx: TenantContext): Prisma.FollowUpWhereInput {
  return { agencyId: ctx.agencyId, lead: { is: leadScope(ctx) } };
}

/**
 * Time windows (IST):
 *   overdue  = pending, due before now
 *   today    = pending, due from now until the end of today
 *   upcoming = pending, due after today
 * (The same "overdue" rule as the leads list filter.)
 */
export function followUpViewWhere(view: FollowUpListView, now: Date): Prisma.FollowUpWhereInput {
  const { end } = istDayRange(now);
  switch (view) {
    case 'overdue':
      return { status: FollowUpStatus.PENDING, dueAt: { lt: now } };
    case 'today':
      return { status: FollowUpStatus.PENDING, dueAt: { gte: now, lt: end } };
    case 'upcoming':
      return { status: FollowUpStatus.PENDING, dueAt: { gte: end } };
    case 'completed':
      return { status: FollowUpStatus.COMPLETED };
    case 'cancelled':
      return { status: FollowUpStatus.CANCELLED };
    default:
      return {};
  }
}

@Injectable()
export class FollowUpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly members: MembersService,
  ) {}

  async list(ctx: TenantContext, q: ListFollowUpsQueryDto): Promise<Paginated<FollowUpView>> {
    const view = q.view ?? 'all';
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 30;
    const where: Prisma.FollowUpWhereInput = {
      AND: [
        followUpScope(ctx),
        followUpViewWhere(view, new Date()),
        q.assignedTo ? { assignedUserId: q.assignedTo === 'me' ? ctx.userId : q.assignedTo } : {},
      ],
    };
    const orderBy: Prisma.FollowUpOrderByWithRelationInput[] =
      view === 'completed' ? [{ completedAt: 'desc' }, { id: 'desc' }]
      : view === 'cancelled' || view === 'all' ? [{ dueAt: 'desc' }, { id: 'desc' }]
      : [{ dueAt: 'asc' }, { id: 'asc' }];
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.followUp.count({ where }),
      this.prisma.followUp.findMany({ where, select: followUpSelect, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return { items: rows.map(toFollowUpView), total, page, pageSize };
  }

  async forLead(ctx: TenantContext, leadId: string): Promise<FollowUpView[]> {
    await this.findLead(this.prisma, ctx, leadId);
    const rows = await this.prisma.followUp.findMany({
      where: { ...followUpScope(ctx), leadId },
      select: followUpSelect,
      orderBy: [{ dueAt: 'desc' }],
      take: 200,
    });
    return rows.map(toFollowUpView);
  }

  async create(ctx: TenantContext, dto: CreateFollowUpDto): Promise<FollowUpView> {
    return this.prisma.$transaction(async (tx) => {
      const lead = await this.findLead(tx, ctx, dto.leadId);
      const assignedUserId = await this.resolveAssignee(tx, ctx, lead.id, dto.assignedUserId, lead.assignedUserId);
      const dueAt = new Date(dto.dueAt);
      const created = await tx.followUp.create({
        data: { agencyId: ctx.agencyId, leadId: lead.id, assignedUserId, dueAt, notes: dto.notes ?? null, status: FollowUpStatus.PENDING },
        select: followUpSelect,
      });
      await this.log(tx, ctx, lead.id, `Follow-up scheduled for ${formatIstDateTime(dueAt)}${dto.notes ? `: ${dto.notes}` : ''}`);
      await syncNextFollowUp(tx, ctx.agencyId, lead.id);
      return toFollowUpView(created);
    });
  }

  async update(ctx: TenantContext, id: string, dto: UpdateFollowUpDto): Promise<FollowUpView> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.findPending(tx, ctx, id);
      let assignedUserId: string | null | undefined;
      if (dto.assignedUserId !== undefined && dto.assignedUserId !== (current.assignedUser?.id ?? null)) {
        assignedUserId = await this.resolveAssignee(tx, ctx, current.lead.id, dto.assignedUserId, null);
      }
      const dueAt = dto.dueAt ? new Date(dto.dueAt) : undefined;
      const updated = await tx.followUp.update({
        where: { id },
        data: { dueAt, notes: dto.notes, assignedUserId },
        select: followUpSelect,
      });
      if (dueAt && dueAt.getTime() !== current.dueAt.getTime()) {
        await this.log(tx, ctx, current.lead.id, `Follow-up rescheduled from ${formatIstDateTime(current.dueAt)} to ${formatIstDateTime(dueAt)}`);
      }
      await syncNextFollowUp(tx, ctx.agencyId, current.lead.id);
      return toFollowUpView(updated);
    });
  }

  /** Marks it done and, optionally, schedules the next follow-up in the same step. */
  async complete(ctx: TenantContext, id: string, dto: CompleteFollowUpDto): Promise<FollowUpView> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.findPending(tx, ctx, id);
      const done = await tx.followUp.update({
        where: { id },
        data: { status: FollowUpStatus.COMPLETED, completedAt: new Date() },
        select: followUpSelect,
      });
      await this.log(tx, ctx, current.lead.id, `Follow-up done${dto.outcome ? `: ${dto.outcome}` : ''}`);
      if (dto.nextDueAt) {
        const nextDueAt = new Date(dto.nextDueAt);
        await tx.followUp.create({
          data: {
            agencyId: ctx.agencyId,
            leadId: current.lead.id,
            assignedUserId: current.assignedUser?.id ?? null,
            dueAt: nextDueAt,
            status: FollowUpStatus.PENDING,
          },
        });
        await this.log(tx, ctx, current.lead.id, `Next follow-up scheduled for ${formatIstDateTime(nextDueAt)}`);
      }
      await syncNextFollowUp(tx, ctx.agencyId, current.lead.id);
      return toFollowUpView(done);
    });
  }

  async cancel(ctx: TenantContext, id: string, reason?: string): Promise<FollowUpView> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.findPending(tx, ctx, id);
      const cancelled = await tx.followUp.update({ where: { id }, data: { status: FollowUpStatus.CANCELLED }, select: followUpSelect });
      await this.log(tx, ctx, current.lead.id, `Follow-up for ${formatIstDateTime(current.dueAt)} cancelled${reason ? `: ${reason}` : ''}`);
      await syncNextFollowUp(tx, ctx.agencyId, current.lead.id);
      return toFollowUpView(cancelled);
    });
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async findLead(db: Db, ctx: TenantContext, leadId: string): Promise<{ id: string; assignedUserId: string | null }> {
    const lead = await db.lead.findFirst({ where: { id: leadId, ...leadScope(ctx) }, select: { id: true, assignedUserId: true } });
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  /** Tenant- and lead-visibility-scoped; another agency's id behaves like a missing one. */
  private async findPending(db: Db, ctx: TenantContext, id: string): Promise<FollowUpRow> {
    const row = await db.followUp.findFirst({ where: { id, ...followUpScope(ctx) }, select: followUpSelect });
    if (!row) throw new NotFoundException('Follow-up not found');
    if (row.status !== FollowUpStatus.PENDING) throw new BadRequestException('This follow-up is already closed.');
    return row;
  }

  /** Default: the lead's assignee, else the caller. Agents can only assign themselves. */
  private async resolveAssignee(
    db: Db,
    ctx: TenantContext,
    leadId: string,
    requested: string | null | undefined,
    fallback: string | null,
  ): Promise<string | null> {
    if (requested === undefined) return fallback ?? ctx.userId;
    if (!canAssignLeads(ctx.role) && requested !== ctx.userId) {
      throw forbidden(ApiErrorCode.INSUFFICIENT_ROLE, 'Only owners and admins can assign follow-ups to others.');
    }
    if (requested === null) return null;
    await this.members.assertCanHandleLead(ctx.agencyId, requested, leadId, db);
    return requested;
  }

  private async log(tx: Prisma.TransactionClient, ctx: TenantContext, leadId: string, description: string): Promise<void> {
    await tx.leadActivity.create({
      data: { agencyId: ctx.agencyId, leadId, userId: ctx.userId, activityType: LeadActivityType.FOLLOW_UP, description },
    });
  }
}
