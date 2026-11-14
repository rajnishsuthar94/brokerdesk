import { Injectable } from '@nestjs/common';
import { ApiErrorCode } from '@brokerdesk/shared-types';
import { forbidden } from '../common/http/api-errors.js';
import type { Prisma } from '../generated/prisma/client.js';
import { SubscriptionPlan } from '../generated/prisma/enums.js';
import { effectiveLimits } from './plan-catalog.js';
import { PlanCatalogService } from './plan-catalog.service.js';

/**
 * Server-side enforcement of plan limits (team seats and leads).
 *
 * Must be called inside the same transaction as the write it guards: it locks the
 * agency's subscription row (SELECT … FOR UPDATE), so two concurrent requests
 * cannot both take the last seat / lead slot. Expired or cancelled subscriptions
 * get the Free plan's limits (see `effectiveLimits`).
 */
@Injectable()
export class SubscriptionLimitsService {
  constructor(private readonly plans: PlanCatalogService) {}

  private async current(tx: Prisma.TransactionClient, agencyId: string): Promise<{ planName: string; active: boolean; leadLimit: number | null; userLimit: number | null }> {
    await tx.$queryRaw`SELECT id FROM subscriptions WHERE agency_id = ${agencyId} FOR UPDATE`;
    const sub = await tx.subscription.findUnique({
      where: { agencyId },
      select: { plan: true, status: true, expiresAt: true, leadLimit: true, userLimit: true },
    });
    const limits = effectiveLimits(sub, this.plans.catalog);
    const plan = limits.active && sub ? sub.plan : SubscriptionPlan.FREE;
    return { planName: this.plans.get(plan).displayName, ...limits };
  }

  private static suffix(active: boolean): string {
    return active ? 'Upgrade your plan to add more.' : 'Your paid plan has ended, so Free limits apply. Renew to add more.';
  }

  async assertSeatAvailable(
    tx: Prisma.TransactionClient,
    agencyId: string,
    options: { readonly countPendingInvitations: boolean },
  ): Promise<void> {
    const { planName, active, userLimit: limit } = await this.current(tx, agencyId);
    if (limit === null) return;

    const members = await tx.agencyMember.count({ where: { agencyId } });
    const pending = options.countPendingInvitations
      ? await tx.agencyInvitation.count({
          where: { agencyId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        })
      : 0;

    if (members + pending >= limit) {
      throw forbidden(
        ApiErrorCode.SEAT_LIMIT_REACHED,
        `Your ${planName} plan allows ${limit} team member${limit === 1 ? '' : 's'} ` +
          `(including pending invitations). ${SubscriptionLimitsService.suffix(active)}`,
      );
    }
  }

  /** Throws unless the agency can hold `adding` more (non-deleted) leads. */
  async assertLeadCapacity(tx: Prisma.TransactionClient, agencyId: string, adding: number): Promise<void> {
    if (adding <= 0) return;
    const { planName, active, leadLimit: limit } = await this.current(tx, agencyId);
    if (limit === null) return;

    const current = await tx.lead.count({ where: { agencyId, deletedAt: null } });
    if (current + adding > limit) {
      const remaining = Math.max(0, limit - current);
      throw forbidden(
        ApiErrorCode.LEAD_LIMIT_REACHED,
        adding === 1
          ? `Your ${planName} plan allows ${limit} leads and you have reached the limit. ${SubscriptionLimitsService.suffix(active)}`
          : `Your ${planName} plan allows ${limit} leads. You can add ${remaining} more, but this import has ${adding}.`,
      );
    }
  }
}
