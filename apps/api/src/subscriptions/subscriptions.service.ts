import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { SubscriptionSummary } from '@brokerdesk/shared-types';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import type { TenantContext } from '../common/auth/auth.types.js';
import type { RequestMeta } from '../common/http/request-meta.js';
import { AppConfigService } from '../config/app-config.service.js';
import type { SubscriptionPlan } from '../generated/prisma/enums.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PLAN_ORDER, effectiveLimits } from './plan-catalog.js';
import { PlanCatalogService } from './plan-catalog.service.js';

/** At most one upgrade request per agency per this window (spam guard for the sales inbox). */
const UPGRADE_REQUEST_COOLDOWN_MS = 10 * 60_000;

/**
 * Subscription status, usage and plan changes.
 *
 * There is NO payment gateway: customers ask for an upgrade from the app (the
 * request is audited and emailed to SALES_CONTACT_EMAIL); after payment is
 * arranged offline, an operator applies the plan with `npm run plan:set`
 * (src/cli/set-plan.ts — deliberately not reachable over HTTP).
 */
@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlanCatalogService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  async summary(ctx: TenantContext, now = new Date()): Promise<SubscriptionSummary> {
    const [sub, leads, members, pendingInvitations, lastRequest] = await Promise.all([
      this.prisma.subscription.findUnique({ where: { agencyId: ctx.agencyId } }),
      this.prisma.lead.count({ where: { agencyId: ctx.agencyId, deletedAt: null } }),
      this.prisma.agencyMember.count({ where: { agencyId: ctx.agencyId } }),
      this.prisma.agencyInvitation.count({ where: { agencyId: ctx.agencyId, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } } }),
      this.prisma.auditLog.findFirst({
        where: { agencyId: ctx.agencyId, action: AuditAction.SUBSCRIPTION_UPGRADE_REQUESTED },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);
    if (!sub) throw new NotFoundException('Subscription not found');
    const limits = effectiveLimits(sub, this.plans.catalog, now);
    return {
      plan: sub.plan,
      displayName: this.plans.get(sub.plan).displayName,
      status: sub.status,
      startsAt: sub.startsAt.toISOString(),
      expiresAt: sub.expiresAt?.toISOString() ?? null,
      active: limits.active,
      limits: { leads: limits.leadLimit, users: limits.userLimit },
      usage: { leads, members, pendingInvitations },
      plans: this.plans.list(),
      salesContact: this.config.get('SALES_CONTACT_EMAIL'),
      lastUpgradeRequestAt: lastRequest?.createdAt.toISOString() ?? null,
    };
  }

  /** Records an upgrade request (audited) and emails the sales contact. No payment is taken. */
  async requestUpgrade(ctx: TenantContext, plan: SubscriptionPlan, note: string | undefined, meta: RequestMeta): Promise<void> {
    const sub = await this.prisma.subscription.findUnique({ where: { agencyId: ctx.agencyId } });
    // While a plan is live only higher plans make sense; after it ends, renewing the same plan is fine.
    const live = effectiveLimits(sub, this.plans.catalog).active;
    if (sub && live && PLAN_ORDER.indexOf(plan) <= PLAN_ORDER.indexOf(sub.plan)) {
      throw new BadRequestException('Choose a plan above your current one.');
    }
    if (plan === 'FREE') throw new BadRequestException('Choose a paid plan.');
    const recent = await this.prisma.auditLog.findFirst({
      where: { agencyId: ctx.agencyId, action: AuditAction.SUBSCRIPTION_UPGRADE_REQUESTED, createdAt: { gt: new Date(Date.now() - UPGRADE_REQUEST_COOLDOWN_MS) } },
      select: { id: true },
    });
    if (recent) throw new BadRequestException('We already have your request. Our team will contact you shortly.');

    const [agency, user] = await Promise.all([
      this.prisma.agency.findUniqueOrThrow({ where: { id: ctx.agencyId }, select: { name: true, city: true } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { name: true, email: true, phone: true } }),
    ]);
    await this.audit.record({
      action: AuditAction.SUBSCRIPTION_UPGRADE_REQUESTED,
      agencyId: ctx.agencyId,
      actorUserId: ctx.userId,
      entityType: 'subscription',
      metadata: { from: sub?.plan ?? null, to: plan, ...(note ? { note } : {}) },
      meta,
    });
    const to = this.config.get('SALES_CONTACT_EMAIL');
    if (!to) {
      this.logger.warn(`Upgrade request from agency ${ctx.agencyId} recorded, but SALES_CONTACT_EMAIL is not set`);
      return;
    }
    await this.mail.send({
      to,
      subject: `BrokerDesk upgrade request: ${agency.name} → ${this.plans.get(plan).displayName}`,
      text: [
        `Agency: ${agency.name}${agency.city ? ` (${agency.city})` : ''}`,
        `Agency id: ${ctx.agencyId}`,
        `Current plan: ${sub ? this.plans.get(sub.plan).displayName : 'none'}${live ? '' : ' (ended)'}`,
        `Requested plan: ${this.plans.get(plan).displayName}`,
        `Requested by: ${user.name} <${user.email}>${user.phone ? `, ${user.phone}` : ''}`,
        ...(note ? [`Note: ${note}`] : []),
        '',
        `After payment is arranged, apply it with: npm run plan:set -- --agency ${ctx.agencyId} --plan ${plan} --months 1`,
      ].join('\n'),
    });
  }
}
