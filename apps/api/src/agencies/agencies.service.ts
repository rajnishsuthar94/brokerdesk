import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AgencyDetails } from '@brokerdesk/shared-types';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import type { TenantContext } from '../common/auth/auth.types.js';
import type { RequestMeta } from '../common/http/request-meta.js';
import { makePublicSlug } from '../common/utils/slug.js';
import type { Prisma } from '../generated/prisma/client.js';
import { MemberRole, SubscriptionPlan, SubscriptionStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PlanCatalogService } from '../subscriptions/plan-catalog.service.js';
import type { CreateAgencyDto, UpdateAgencyDto } from './dto/agency.dto.js';

/** Guards against one account spinning up unlimited free agencies. */
export const MAX_OWNED_AGENCIES = 5;

const agencySelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  address: true,
  city: true,
  state: true,
  country: true,
  timezone: true,
  createdAt: true,
} as const satisfies Prisma.AgencySelect;

type AgencyRow = Prisma.AgencyGetPayload<{ select: typeof agencySelect }>;

function toDetails(a: AgencyRow): AgencyDetails {
  return { ...a, createdAt: a.createdAt.toISOString() };
}

@Injectable()
export class AgenciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly plans: PlanCatalogService,
  ) {}

  /**
   * Creates an agency with the user as OWNER and a FREE subscription.
   * Must run inside the caller's transaction (registration reuses it).
   */
  async createInTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
    dto: CreateAgencyDto,
    meta: RequestMeta,
  ): Promise<AgencyDetails> {
    const owned = await tx.agencyMember.count({ where: { userId, role: MemberRole.OWNER } });
    if (owned >= MAX_OWNED_AGENCIES) {
      throw new ForbiddenException(`You can own at most ${MAX_OWNED_AGENCIES} agencies.`);
    }
    const free = this.plans.get(SubscriptionPlan.FREE);
    const agency = await tx.agency.create({
      data: {
        name: dto.name,
        publicSlug: makePublicSlug(dto.name),
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        address: dto.address ?? null,
        city: dto.city ?? 'Ahmedabad',
        state: dto.state ?? 'Gujarat',
        members: { create: { userId, role: MemberRole.OWNER } },
        subscription: {
          create: {
            plan: SubscriptionPlan.FREE,
            status: SubscriptionStatus.ACTIVE,
            leadLimit: free.leadLimit,
            userLimit: free.userLimit,
          },
        },
      },
      select: agencySelect,
    });
    await this.audit.record(
      {
        action: AuditAction.AGENCY_CREATED,
        agencyId: agency.id,
        actorUserId: userId,
        entityType: 'agency',
        entityId: agency.id,
        metadata: { plan: SubscriptionPlan.FREE },
        meta,
      },
      tx,
    );
    return toDetails(agency);
  }

  create(userId: string, dto: CreateAgencyDto, meta: RequestMeta): Promise<AgencyDetails> {
    return this.prisma.$transaction((tx) => this.createInTransaction(tx, userId, dto, meta));
  }

  async getCurrent(ctx: TenantContext): Promise<AgencyDetails> {
    const agency = await this.prisma.agency.findUnique({ where: { id: ctx.agencyId }, select: agencySelect });
    if (!agency) throw new NotFoundException('Agency not found');
    return toDetails(agency);
  }

  async updateCurrent(ctx: TenantContext, dto: UpdateAgencyDto, meta: RequestMeta): Promise<AgencyDetails> {
    return this.prisma.$transaction(async (tx) => {
      const agency = await tx.agency.update({
        where: { id: ctx.agencyId },
        data: {
          name: dto.name,
          email: dto.email,
          phone: dto.phone,
          address: dto.address,
          city: dto.city,
          state: dto.state,
        },
        select: agencySelect,
      });
      await this.audit.record(
        {
          action: AuditAction.AGENCY_UPDATED,
          agencyId: ctx.agencyId,
          actorUserId: ctx.userId,
          entityType: 'agency',
          entityId: ctx.agencyId,
          metadata: { fields: Object.keys(dto).filter((k) => dto[k as keyof UpdateAgencyDto] !== undefined) },
          meta,
        },
        tx,
      );
      return toDetails(agency);
    });
  }
}
