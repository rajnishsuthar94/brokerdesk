import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ApiErrorCode,
  canAssignLeads,
  canDeleteLeads,
  canSeeAllLeads,
  type LeadActivityView,
  type LeadView,
  type Paginated,
} from '@brokerdesk/shared-types';
import { MembersService } from '../agencies/members.service.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import type { TenantContext } from '../common/auth/auth.types.js';
import { forbidden } from '../common/http/api-errors.js';
import type { RequestMeta } from '../common/http/request-meta.js';
import type { Prisma } from '../generated/prisma/client.js';
import { FollowUpStatus, LeadActivityType, LeadStatus } from '../generated/prisma/enums.js';
import { closedAtFor, handOverOpenWork, syncNextFollowUp } from '../follow-ups/follow-up-sync.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SubscriptionLimitsService } from '../subscriptions/subscription-limits.service.js';
import type {
  ChangeLeadStatusDto,
  CreateLeadActivityDto,
  CreateLeadDto,
  LeadFieldsDto,
  ListLeadsQueryDto,
  UpdateLeadDto,
} from './dto/lead.dto.js';
import { buildLeadOrderBy, buildLeadWhere, leadScope } from './lead-query.js';
import { activitySelect, leadSelect, type LeadRow, toActivityView, toLeadView } from './lead.mapper.js';

const STATUS_LABEL: Readonly<Record<LeadStatus, string>> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  SITE_VISIT: 'Site Visit',
  NEGOTIATION: 'Negotiation',
  WON: 'Won',
  LOST: 'Lost',
};

type Db = Prisma.TransactionClient | PrismaService;

/** Fields that map 1:1 from the DTO to the Prisma model. */
function scalarData(dto: LeadFieldsDto): Prisma.LeadUncheckedUpdateInput {
  return {
    name: dto.name,
    phone: dto.phone,
    email: dto.email,
    source: dto.source,
    budgetMin: dto.budgetMin,
    budgetMax: dto.budgetMax,
    preferredLocation: dto.preferredLocation,
    bhk: dto.bhk,
    propertyType: dto.propertyType,
    listingType: dto.listingType,
    areaMin: dto.areaMin,
    areaMax: dto.areaMax,
    areaUnit: dto.areaUnit,
    priority: dto.priority,
    notes: dto.notes,
  };
}

function assertRange(min: number | null | undefined, max: number | null | undefined, label: string): void {
  if (typeof min === 'number' && typeof max === 'number' && min > max) {
    throw new BadRequestException(`Minimum ${label} cannot be more than maximum ${label}`);
  }
}

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly members: MembersService,
    private readonly limits: SubscriptionLimitsService,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: TenantContext, q: ListLeadsQueryDto): Promise<Paginated<LeadView>> {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const where = buildLeadWhere(ctx, q, new Date());
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.lead.count({ where }),
      this.prisma.lead.findMany({
        where,
        select: leadSelect,
        orderBy: buildLeadOrderBy(q),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items: rows.map(toLeadView), total, page, pageSize };
  }

  async get(ctx: TenantContext, id: string): Promise<LeadView> {
    return toLeadView(await this.findVisible(this.prisma, ctx, id));
  }

  async create(ctx: TenantContext, dto: CreateLeadDto): Promise<LeadView> {
    assertRange(dto.budgetMin, dto.budgetMax, 'budget');
    assertRange(dto.areaMin, dto.areaMax, 'area');
    const assignedUserId = await this.resolveAssigneeForCreate(ctx, dto.assignedUserId);

    return this.prisma.$transaction(async (tx) => {
      if (!dto.allowDuplicate) await this.assertNoDuplicate(tx, ctx, dto.phone);
      await this.limits.assertLeadCapacity(tx, ctx.agencyId, 1);
      const status = dto.status ?? LeadStatus.NEW;
      const lead = await tx.lead.create({
        data: {
          ...(scalarData(dto) as Prisma.LeadUncheckedCreateInput),
          name: dto.name,
          phone: dto.phone,
          agencyId: ctx.agencyId,
          assignedUserId,
          status,
          closedAt: closedAtFor(status, null) ?? null,
        },
        select: { id: true },
      });
      if (dto.nextFollowUpAt) {
        await tx.followUp.create({
          data: {
            agencyId: ctx.agencyId,
            leadId: lead.id,
            // Same default as scheduling a follow-up: the lead's assignee, else the creator.
            assignedUserId: assignedUserId ?? ctx.userId,
            dueAt: new Date(dto.nextFollowUpAt),
            status: FollowUpStatus.PENDING,
          },
        });
        await syncNextFollowUp(tx, ctx.agencyId, lead.id);
      }
      return toLeadView(await tx.lead.findUniqueOrThrow({ where: { id: lead.id }, select: leadSelect }));
    });
  }

  async update(ctx: TenantContext, id: string, dto: UpdateLeadDto): Promise<LeadView> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.findVisible(tx, ctx, id);
      assertRange(
        dto.budgetMin !== undefined ? dto.budgetMin : current.budgetMin?.toNumber(),
        dto.budgetMax !== undefined ? dto.budgetMax : current.budgetMax?.toNumber(),
        'budget',
      );
      assertRange(
        dto.areaMin !== undefined ? dto.areaMin : current.areaMin?.toNumber(),
        dto.areaMax !== undefined ? dto.areaMax : current.areaMax?.toNumber(),
        'area',
      );
      if (dto.phone && dto.phone !== current.phone && !dto.allowDuplicate) {
        await this.assertNoDuplicate(tx, ctx, dto.phone, id);
      }

      const activities: Prisma.LeadActivityCreateManyInput[] = [];
      if (dto.status && dto.status !== current.status) {
        activities.push(this.statusActivity(ctx, id, current.status, dto.status));
      }
      let assignedUserId: string | null | undefined;
      if (dto.assignedUserId !== undefined && dto.assignedUserId !== (current.assignedUser?.id ?? null)) {
        assignedUserId = await this.validateAssignee(tx, ctx, dto.assignedUserId);
        activities.push(await this.assignmentActivity(tx, ctx, id, assignedUserId));
        await handOverOpenWork(tx, ctx.agencyId, id, current.assignedUser?.id ?? null, assignedUserId);
      }

      const lead = await tx.lead.update({
        where: { id },
        data: {
          ...scalarData(dto),
          status: dto.status,
          closedAt: dto.status ? closedAtFor(dto.status, current.status) : undefined,
          assignedUserId,
        },
        select: leadSelect,
      });
      if (activities.length > 0) await tx.leadActivity.createMany({ data: activities });
      return toLeadView(lead);
    });
  }

  async changeStatus(ctx: TenantContext, id: string, dto: ChangeLeadStatusDto): Promise<LeadView> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.findVisible(tx, ctx, id);
      if (current.status === dto.status && !dto.note) return toLeadView(current);
      const lead = await tx.lead.update({
        where: { id },
        data: { status: dto.status, closedAt: closedAtFor(dto.status, current.status) },
        select: leadSelect,
      });
      await tx.leadActivity.create({
        data: this.statusActivity(ctx, id, current.status, dto.status, dto.note),
      });
      return toLeadView(lead);
    });
  }

  async assign(ctx: TenantContext, id: string, assignedUserId: string | null, meta: RequestMeta): Promise<LeadView> {
    if (!canAssignLeads(ctx.role)) {
      throw forbidden(ApiErrorCode.INSUFFICIENT_ROLE, 'Only owners and admins can assign leads.');
    }
    return this.prisma.$transaction(async (tx) => {
      const current = await this.findVisible(tx, ctx, id);
      if ((current.assignedUser?.id ?? null) === assignedUserId) return toLeadView(current);
      const validated = await this.validateAssignee(tx, ctx, assignedUserId);
      const lead = await tx.lead.update({ where: { id }, data: { assignedUserId: validated }, select: leadSelect });
      await handOverOpenWork(tx, ctx.agencyId, id, current.assignedUser?.id ?? null, validated);
      await tx.leadActivity.create({ data: await this.assignmentActivity(tx, ctx, id, validated) });
      await this.audit.record(
        {
          action: AuditAction.LEAD_ASSIGNED,
          agencyId: ctx.agencyId,
          actorUserId: ctx.userId,
          entityType: 'lead',
          entityId: id,
          metadata: { from: current.assignedUser?.id ?? null, to: validated },
          meta,
        },
        tx,
      );
      return toLeadView(lead);
    });
  }

  /** Soft delete (managers only). History is kept; the lead disappears from lists. */
  async remove(ctx: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    if (!canDeleteLeads(ctx.role)) {
      throw forbidden(ApiErrorCode.INSUFFICIENT_ROLE, 'Only owners and admins can delete leads.');
    }
    await this.prisma.$transaction(async (tx) => {
      const lead = await this.findVisible(tx, ctx, id);
      await tx.lead.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.record(
        {
          action: AuditAction.LEAD_DELETED,
          agencyId: ctx.agencyId,
          actorUserId: ctx.userId,
          entityType: 'lead',
          entityId: id,
          metadata: { name: lead.name, status: lead.status },
          meta,
        },
        tx,
      );
    });
  }

  async listActivities(ctx: TenantContext, id: string): Promise<LeadActivityView[]> {
    await this.findVisible(this.prisma, ctx, id);
    const rows = await this.prisma.leadActivity.findMany({
      where: { agencyId: ctx.agencyId, leadId: id },
      select: activitySelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200,
    });
    return rows.map(toActivityView);
  }

  async addActivity(ctx: TenantContext, id: string, dto: CreateLeadActivityDto): Promise<LeadActivityView> {
    return this.prisma.$transaction(async (tx) => {
      await this.findVisible(tx, ctx, id);
      const row = await tx.leadActivity.create({
        data: {
          agencyId: ctx.agencyId,
          leadId: id,
          userId: ctx.userId,
          activityType: dto.activityType,
          description: dto.description,
        },
        select: activitySelect,
      });
      // Touch the lead so "recently updated" sorting reflects contact.
      await tx.lead.update({ where: { id }, data: { updatedAt: new Date() } });
      return toActivityView(row);
    });
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  /**
   * Tenant- and role-scoped lookup. A lead in another agency, a deleted lead and
   * (for agents) a lead assigned to someone else all produce the same 404.
   */
  private async findVisible(db: Db, ctx: TenantContext, id: string): Promise<LeadRow> {
    const lead = await db.lead.findFirst({ where: { id, ...leadScope(ctx) }, select: leadSelect });
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  private async resolveAssigneeForCreate(ctx: TenantContext, requested: string | null | undefined): Promise<string | null> {
    if (!canAssignLeads(ctx.role)) {
      // Agents' leads are always theirs (otherwise they could not see them).
      if (requested && requested !== ctx.userId) {
        throw forbidden(ApiErrorCode.INSUFFICIENT_ROLE, 'Agents can only add leads for themselves.');
      }
      return ctx.userId;
    }
    return requested === undefined ? null : this.validateAssignee(this.prisma, ctx, requested);
  }

  private async validateAssignee(db: Db, ctx: TenantContext, userId: string | null): Promise<string | null> {
    if (userId === null) {
      if (!canAssignLeads(ctx.role)) {
        throw forbidden(ApiErrorCode.INSUFFICIENT_ROLE, 'Only owners and admins can reassign leads.');
      }
      return null;
    }
    if (!canAssignLeads(ctx.role) && userId !== ctx.userId) {
      throw forbidden(ApiErrorCode.INSUFFICIENT_ROLE, 'Only owners and admins can reassign leads.');
    }
    // Never trust an id from the client: it must be a member of THIS agency.
    await this.members.assertIsMember(ctx.agencyId, userId, db);
    return userId;
  }

  private async assertNoDuplicate(db: Db, ctx: TenantContext, phone: string, exceptId?: string): Promise<void> {
    const existing = await db.lead.findFirst({
      where: { agencyId: ctx.agencyId, deletedAt: null, phone, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true, name: true, assignedUserId: true },
    });
    if (!existing) return;
    // Agents only learn details of leads they are allowed to see.
    const visible = canSeeAllLeads(ctx.role) || existing.assignedUserId === ctx.userId;
    throw new ConflictException({
      statusCode: 409,
      error: 'Conflict',
      code: ApiErrorCode.DUPLICATE_LEAD,
      message: visible
        ? `A lead with this phone number already exists: ${existing.name}`
        : 'A lead with this phone number already exists in your agency (assigned to another team member).',
      existingLead: visible ? { id: existing.id, name: existing.name } : undefined,
    });
  }

  private statusActivity(
    ctx: TenantContext,
    leadId: string,
    from: LeadStatus,
    to: LeadStatus,
    note?: string,
  ): Prisma.LeadActivityCreateManyInput {
    const base = from === to ? `Status: ${STATUS_LABEL[to]}` : `Status changed from ${STATUS_LABEL[from]} to ${STATUS_LABEL[to]}`;
    return {
      agencyId: ctx.agencyId,
      leadId,
      userId: ctx.userId,
      activityType: LeadActivityType.STATUS_CHANGE,
      description: note ? `${base}. ${note}` : base,
    };
  }

  private async assignmentActivity(
    db: Db,
    ctx: TenantContext,
    leadId: string,
    assigneeId: string | null,
  ): Promise<Prisma.LeadActivityCreateManyInput> {
    const assignee = assigneeId ? await db.user.findUnique({ where: { id: assigneeId }, select: { name: true } }) : null;
    return {
      agencyId: ctx.agencyId,
      leadId,
      userId: ctx.userId,
      activityType: LeadActivityType.ASSIGNMENT,
      description: assignee ? `Assigned to ${assignee.name}` : 'Unassigned',
    };
  }
}
