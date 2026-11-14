import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ApiErrorCode, canSeeAllLeads, type TeamMember } from '@brokerdesk/shared-types';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import type { TenantContext } from '../common/auth/auth.types.js';
import { forbidden } from '../common/http/api-errors.js';
import type { RequestMeta } from '../common/http/request-meta.js';
import type { Prisma } from '../generated/prisma/client.js';
import { MemberRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { canAssignRole, canManageMember } from './member-policy.js';

const memberSelect = {
  id: true,
  userId: true,
  role: true,
  joinedAt: true,
  user: { select: { name: true, email: true, phone: true } },
} as const satisfies Prisma.AgencyMemberSelect;

type MemberRow = Prisma.AgencyMemberGetPayload<{ select: typeof memberSelect }>;

function toTeamMember(m: MemberRow): TeamMember {
  return {
    memberId: m.id,
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
    phone: m.user.phone,
    role: m.role,
    joinedAt: m.joinedAt.toISOString(),
  };
}

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: TenantContext): Promise<TeamMember[]> {
    const rows = await this.prisma.agencyMember.findMany({
      where: { agencyId: ctx.agencyId },
      select: memberSelect,
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    });
    return rows.map(toTeamMember);
  }

  /**
   * For other features (leads, properties…): throws unless `userId` belongs to the
   * caller's agency. Use it before storing any assignee id received from a client.
   */
  async assertIsMember(agencyId: string, userId: string, db: Prisma.TransactionClient | PrismaService = this.prisma): Promise<void> {
    const found = await db.agencyMember.findUnique({
      where: { agencyId_userId: { agencyId, userId } },
      select: { id: true },
    });
    if (!found) throw new BadRequestException('The selected team member is not part of this agency');
  }

  /**
   * The user must be a member who can see the lead: agents only see leads
   * assigned to them, so work on another lead can't be given to an agent.
   */
  async assertCanHandleLead(agencyId: string, userId: string, leadId: string, db: Prisma.TransactionClient | PrismaService = this.prisma): Promise<void> {
    const member = await db.agencyMember.findUnique({ where: { agencyId_userId: { agencyId, userId } }, select: { role: true } });
    if (!member) throw new BadRequestException('The selected team member is not part of this agency');
    if (canSeeAllLeads(member.role)) return;
    const lead = await db.lead.findFirst({ where: { id: leadId, agencyId }, select: { assignedUserId: true } });
    if (lead?.assignedUserId !== userId) {
      throw new BadRequestException('This agent can only be given work on leads assigned to them. Assign the lead to them first.');
    }
  }

  async changeRole(ctx: TenantContext, memberId: string, role: MemberRole, meta: RequestMeta): Promise<TeamMember> {
    if (memberId === ctx.memberId) throw new BadRequestException('You cannot change your own role');

    return this.prisma.$transaction(async (tx) => {
      const target = await this.findInAgency(tx, ctx, memberId);
      if (!canManageMember(ctx.role, target.role) || !canAssignRole(ctx.role, role)) {
        throw forbidden(ApiErrorCode.INSUFFICIENT_ROLE, 'You do not have permission to change this role.');
      }
      if (target.role === role) return toTeamMember(target);
      if (target.role === MemberRole.OWNER) await this.assertAnotherOwner(tx, ctx.agencyId, target.id);

      const updated = await tx.agencyMember.update({
        where: { id: target.id },
        data: { role },
        select: memberSelect,
      });
      await this.audit.record(
        {
          action: AuditAction.MEMBER_ROLE_CHANGED,
          agencyId: ctx.agencyId,
          actorUserId: ctx.userId,
          entityType: 'agency_member',
          entityId: target.id,
          metadata: { userId: target.userId, from: target.role, to: role },
          meta,
        },
        tx,
      );
      return toTeamMember(updated);
    });
  }

  async remove(ctx: TenantContext, memberId: string, meta: RequestMeta): Promise<void> {
    if (memberId === ctx.memberId) {
      throw new BadRequestException('To leave this agency use "Leave agency" instead');
    }
    await this.prisma.$transaction(async (tx) => {
      const target = await this.findInAgency(tx, ctx, memberId);
      if (!canManageMember(ctx.role, target.role)) {
        throw forbidden(ApiErrorCode.INSUFFICIENT_ROLE, 'You do not have permission to remove this member.');
      }
      if (target.role === MemberRole.OWNER) await this.assertAnotherOwner(tx, ctx.agencyId, target.id);
      await this.detach(tx, ctx.agencyId, target);
      await this.audit.record(
        {
          action: AuditAction.MEMBER_REMOVED,
          agencyId: ctx.agencyId,
          actorUserId: ctx.userId,
          entityType: 'agency_member',
          entityId: target.id,
          metadata: { userId: target.userId, role: target.role },
          meta,
        },
        tx,
      );
    });
  }

  async leave(ctx: TenantContext, meta: RequestMeta): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const self = await this.findInAgency(tx, ctx, ctx.memberId);
      if (self.role === MemberRole.OWNER) await this.assertAnotherOwner(tx, ctx.agencyId, self.id);
      await this.detach(tx, ctx.agencyId, self);
      await this.audit.record(
        {
          action: AuditAction.MEMBER_LEFT,
          agencyId: ctx.agencyId,
          actorUserId: ctx.userId,
          entityType: 'agency_member',
          entityId: self.id,
          meta,
        },
        tx,
      );
    });
  }

  /** Tenant-scoped lookup: another agency's member id is indistinguishable from a missing one. */
  private async findInAgency(tx: Prisma.TransactionClient, ctx: TenantContext, memberId: string): Promise<MemberRow> {
    const member = await tx.agencyMember.findFirst({
      where: { id: memberId, agencyId: ctx.agencyId },
      select: memberSelect,
    });
    if (!member) throw new NotFoundException('Team member not found');
    return member;
  }

  /** Locks the agency's owner rows so concurrent demotions cannot leave zero owners. */
  private async assertAnotherOwner(tx: Prisma.TransactionClient, agencyId: string, exceptMemberId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM agency_members WHERE agency_id = ${agencyId} AND role = 'OWNER' FOR UPDATE`;
    const others = await tx.agencyMember.count({
      where: { agencyId, role: MemberRole.OWNER, id: { not: exceptMemberId } },
    });
    if (others === 0) {
      throw new ConflictException('An agency must always have at least one owner. Make someone else an owner first.');
    }
  }

  /** Removes the membership and un-assigns the person's open work inside this agency only. */
  private async detach(tx: Prisma.TransactionClient, agencyId: string, member: MemberRow): Promise<void> {
    const where = { agencyId, assignedUserId: member.userId };
    await tx.lead.updateMany({ where, data: { assignedUserId: null } });
    await tx.property.updateMany({ where, data: { assignedUserId: null } });
    await tx.followUp.updateMany({ where, data: { assignedUserId: null } });
    await tx.siteVisit.updateMany({ where, data: { assignedUserId: null } });
    await tx.agencyMember.delete({ where: { id: member.id } });
  }
}
