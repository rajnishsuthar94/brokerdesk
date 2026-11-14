import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ApiErrorCode,
  type AcceptInvitationResponse,
  type CreateInvitationResponse,
  type InvitationPreview,
  type PendingInvitation,
} from '@brokerdesk/shared-types';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import type { AuthPrincipal, TenantContext } from '../common/auth/auth.types.js';
import { generateOpaqueToken, hashToken } from '../common/crypto/tokens.js';
import { forbidden } from '../common/http/api-errors.js';
import type { RequestMeta } from '../common/http/request-meta.js';
import { AppConfigService } from '../config/app-config.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SubscriptionLimitsService } from '../subscriptions/subscription-limits.service.js';
import type { InviteMemberDto } from './dto/agency.dto.js';
import { canInvite } from './member-policy.js';

const invitationSelect = {
  id: true,
  email: true,
  role: true,
  expiresAt: true,
  createdAt: true,
  invitedBy: { select: { name: true } },
} as const satisfies Prisma.AgencyInvitationSelect;

type InvitationRow = Prisma.AgencyInvitationGetPayload<{ select: typeof invitationSelect }>;

function toPending(i: InvitationRow): PendingInvitation {
  return {
    id: i.id,
    email: i.email,
    role: i.role,
    invitedByName: i.invitedBy.name,
    expiresAt: i.expiresAt.toISOString(),
    createdAt: i.createdAt.toISOString(),
  };
}

const INVALID_INVITATION = 'This invitation link is invalid or has expired. Ask the agency to send a new one.';

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
    private readonly limits: SubscriptionLimitsService,
  ) {}

  private pendingWhere(now: Date): Prisma.AgencyInvitationWhereInput {
    return { acceptedAt: null, revokedAt: null, expiresAt: { gt: now } };
  }

  async listPending(ctx: TenantContext): Promise<PendingInvitation[]> {
    const rows = await this.prisma.agencyInvitation.findMany({
      where: { agencyId: ctx.agencyId, ...this.pendingWhere(new Date()) },
      select: invitationSelect,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toPending);
  }

  async create(ctx: TenantContext, dto: InviteMemberDto, meta: RequestMeta): Promise<CreateInvitationResponse> {
    if (!canInvite(ctx.role, dto.role)) {
      throw forbidden(ApiErrorCode.INSUFFICIENT_ROLE, `You cannot invite someone as ${dto.role}.`);
    }
    const token = generateOpaqueToken();
    const now = new Date();

    const { invitation, agencyName, inviterName } = await this.prisma.$transaction(async (tx) => {
      const alreadyMember = await tx.agencyMember.findFirst({
        where: { agencyId: ctx.agencyId, user: { email: dto.email } },
        select: { id: true },
      });
      if (alreadyMember) throw new ConflictException('This person is already a member of your agency');

      // Re-inviting replaces the previous pending invitation for the same email.
      await tx.agencyInvitation.updateMany({
        where: { agencyId: ctx.agencyId, email: dto.email, ...this.pendingWhere(now) },
        data: { revokedAt: now },
      });
      await this.limits.assertSeatAvailable(tx, ctx.agencyId, { countPendingInvitations: true });

      const created = await tx.agencyInvitation.create({
        data: {
          agencyId: ctx.agencyId,
          email: dto.email,
          role: dto.role,
          tokenHash: hashToken(token),
          invitedById: ctx.userId,
          expiresAt: new Date(now.getTime() + this.config.get('INVITATION_TTL_DAYS') * 86_400_000),
        },
        select: { ...invitationSelect, agency: { select: { name: true } } },
      });
      await this.audit.record(
        {
          action: AuditAction.INVITATION_CREATED,
          agencyId: ctx.agencyId,
          actorUserId: ctx.userId,
          entityType: 'agency_invitation',
          entityId: created.id,
          metadata: { email: dto.email, role: dto.role },
          meta,
        },
        tx,
      );
      return { invitation: created, agencyName: created.agency.name, inviterName: created.invitedBy.name };
    });

    const inviteUrl = `${this.config.get('APP_BASE_URL')}/invite?token=${encodeURIComponent(token)}`;
    await this.mail.sendInvitation(dto.email, agencyName, inviterName, inviteUrl);
    return { invitation: toPending(invitation), inviteUrl };
  }

  async revoke(ctx: TenantContext, invitationId: string, meta: RequestMeta): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      // Tenant-scoped: another agency's invitation id behaves exactly like a missing one.
      const result = await tx.agencyInvitation.updateMany({
        where: { id: invitationId, agencyId: ctx.agencyId, ...this.pendingWhere(now) },
        data: { revokedAt: now },
      });
      if (result.count === 0) throw new NotFoundException('Invitation not found');
      await this.audit.record(
        {
          action: AuditAction.INVITATION_REVOKED,
          agencyId: ctx.agencyId,
          actorUserId: ctx.userId,
          entityType: 'agency_invitation',
          entityId: invitationId,
          meta,
        },
        tx,
      );
    });
  }

  /** Public: lets the invitee see what they are joining before logging in. */
  async preview(token: string): Promise<InvitationPreview> {
    const row = await this.prisma.agencyInvitation.findFirst({
      where: { tokenHash: hashToken(token), ...this.pendingWhere(new Date()) },
      select: { ...invitationSelect, agency: { select: { name: true } } },
    });
    if (!row) throw new NotFoundException(INVALID_INVITATION);
    return {
      agencyName: row.agency.name,
      email: row.email,
      role: row.role,
      invitedByName: row.invitedBy.name,
      expiresAt: row.expiresAt.toISOString(),
    };
  }

  async accept(auth: AuthPrincipal, token: string, meta: RequestMeta): Promise<AcceptInvitationResponse> {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const invitation = await tx.agencyInvitation.findFirst({
        where: { tokenHash: hashToken(token), ...this.pendingWhere(now) },
        select: { id: true, agencyId: true, email: true, role: true },
      });
      if (!invitation) throw new BadRequestException(INVALID_INVITATION);

      const user = await tx.user.findUniqueOrThrow({ where: { id: auth.userId }, select: { email: true } });
      if (user.email !== invitation.email) {
        throw new BadRequestException(
          `This invitation was sent to ${invitation.email}. Log in with that email address to accept it.`,
        );
      }

      // Claim the invitation first so it can only ever be used once.
      const claimed = await tx.agencyInvitation.updateMany({
        where: { id: invitation.id, acceptedAt: null, revokedAt: null },
        data: { acceptedAt: now },
      });
      if (claimed.count === 0) throw new BadRequestException(INVALID_INVITATION);

      const existing = await tx.agencyMember.findUnique({
        where: { agencyId_userId: { agencyId: invitation.agencyId, userId: auth.userId } },
        select: { id: true },
      });
      if (!existing) {
        await this.limits.assertSeatAvailable(tx, invitation.agencyId, { countPendingInvitations: false });
        await tx.agencyMember.create({
          data: { agencyId: invitation.agencyId, userId: auth.userId, role: invitation.role },
        });
      }
      await this.audit.record(
        {
          action: AuditAction.INVITATION_ACCEPTED,
          agencyId: invitation.agencyId,
          actorUserId: auth.userId,
          entityType: 'agency_invitation',
          entityId: invitation.id,
          metadata: { role: invitation.role },
          meta,
        },
        tx,
      );
      return { agencyId: invitation.agencyId };
    });
  }
}
