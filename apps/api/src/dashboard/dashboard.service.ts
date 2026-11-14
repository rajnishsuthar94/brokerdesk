import { Injectable } from '@nestjs/common';
import { canSeeAllLeads, type DashboardSummary, type MonthlyCount, type ReminderCounts } from '@brokerdesk/shared-types';
import type { TenantContext } from '../common/auth/auth.types.js';
import { istDayRange, istMonthKey, istMonthStart } from '../common/utils/indian-formats.js';
import { FollowUpStatus, LeadStatus, SiteVisitStatus } from '../generated/prisma/enums.js';
import { followUpScope, followUpViewWhere } from '../follow-ups/follow-ups.service.js';
import { followUpSelect, toFollowUpView } from '../follow-ups/follow-up.mapper.js';
import { leadScope } from '../leads/lead-query.js';
import { MediaUrlService } from '../media/media-url.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { siteVisitScope, siteVisitViewWhere } from '../site-visits/site-visits.service.js';
import { siteVisitSelect, toSiteVisitView } from '../site-visits/site-visit.mapper.js';

export const DASHBOARD_MONTHS = 6;
const UPCOMING_VISIT_DAYS = 7;

/** The last N IST months as "YYYY-MM", oldest first. */
export function lastMonths(now: Date, n = DASHBOARD_MONTHS): string[] {
  return Array.from({ length: n }, (_, i) => istMonthKey(istMonthStart(now, i - (n - 1))));
}

/** Buckets dates into IST months; dates outside `months` are ignored. Pure (unit-tested). */
export function bucketByMonth(dates: readonly Date[], months: readonly string[]): MonthlyCount[] {
  const counts = new Map(months.map((m) => [m, 0]));
  for (const d of dates) {
    const key = istMonthKey(d);
    const current = counts.get(key);
    if (current !== undefined) counts.set(key, current + 1);
  }
  return months.map((month) => ({ month, count: counts.get(month) ?? 0 }));
}

/**
 * All dashboard numbers come from the database, in the caller's scope:
 * owners/admins see the agency, agents see their own leads (and the follow-ups
 * and visits of those leads). Months are calendar months in Asia/Kolkata.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly urls: MediaUrlService,
  ) {}

  async summary(ctx: TenantContext, now = new Date()): Promise<DashboardSummary> {
    const leads = leadScope(ctx);
    const fu = followUpScope(ctx);
    const visits = siteVisitScope(ctx);
    const months = lastMonths(now);
    const windowStart = istMonthStart(now, -(DASHBOARD_MONTHS - 1));
    const { end: endOfToday } = istDayRange(now);
    const weekAhead = new Date(now.getTime() + UPCOMING_VISIT_DAYS * 86_400_000);
    const openVisit = { in: [SiteVisitStatus.SCHEDULED, SiteVisitStatus.RESCHEDULED] };

    const [
      totalLeads, newThisMonth, dueToday, overdue, upcomingVisits, won, lost,
      bySource, byStatus, createdDates, visitRows, closedRows, agendaFollowUps, agendaVisits,
    ] = await Promise.all([
      this.prisma.lead.count({ where: leads }),
      this.prisma.lead.count({ where: { ...leads, createdAt: { gte: istMonthStart(now) } } }),
      this.prisma.followUp.count({ where: { AND: [fu, followUpViewWhere('today', now)] } }),
      this.prisma.followUp.count({ where: { AND: [fu, followUpViewWhere('overdue', now)] } }),
      this.prisma.siteVisit.count({ where: { ...visits, status: openVisit, scheduledAt: { gte: now, lt: weekAhead } } }),
      this.prisma.lead.count({ where: { ...leads, status: LeadStatus.WON } }),
      this.prisma.lead.count({ where: { ...leads, status: LeadStatus.LOST } }),
      this.prisma.lead.groupBy({ by: ['source'], where: leads, _count: { _all: true } }),
      this.prisma.lead.groupBy({ by: ['status'], where: leads, _count: { _all: true } }),
      this.prisma.lead.findMany({ where: { ...leads, createdAt: { gte: windowStart } }, select: { createdAt: true } }),
      this.prisma.siteVisit.findMany({
        where: { ...visits, scheduledAt: { gte: windowStart }, status: { not: SiteVisitStatus.CANCELLED } },
        select: { scheduledAt: true, status: true },
      }),
      this.prisma.lead.findMany({
        where: { ...leads, status: { in: [LeadStatus.WON, LeadStatus.LOST] }, closedAt: { gte: windowStart } },
        select: { closedAt: true, status: true },
      }),
      this.prisma.followUp.findMany({
        where: { ...fu, status: FollowUpStatus.PENDING, dueAt: { lt: endOfToday } },
        select: followUpSelect,
        orderBy: { dueAt: 'asc' },
        take: 10,
      }),
      this.prisma.siteVisit.findMany({
        where: { AND: [visits, siteVisitViewWhere('upcoming', now)] },
        select: siteVisitSelect,
        orderBy: { scheduledAt: 'asc' },
        take: 5,
      }),
    ]);

    const visitsMonthly = bucketByMonth(visitRows.map((v) => v.scheduledAt), months);
    const completedMonthly = bucketByMonth(visitRows.filter((v) => v.status === SiteVisitStatus.COMPLETED).map((v) => v.scheduledAt), months);
    const wonMonthly = bucketByMonth(closedRows.filter((l) => l.status === LeadStatus.WON).map((l) => l.closedAt!), months);
    const lostMonthly = bucketByMonth(closedRows.filter((l) => l.status === LeadStatus.LOST).map((l) => l.closedAt!), months);

    return {
      scope: canSeeAllLeads(ctx.role) ? 'agency' : 'mine',
      totals: {
        totalLeads,
        newLeadsThisMonth: newThisMonth,
        followUpsDueToday: dueToday,
        overdueFollowUps: overdue,
        upcomingSiteVisits: upcomingVisits,
        wonDeals: won,
        lostLeads: lost,
        conversionRate: totalLeads === 0 ? 0 : Math.round((won / totalLeads) * 1000) / 10,
      },
      leadsBySource: bySource.map((r) => ({ source: r.source, count: r._count._all })).sort((a, b) => b.count - a.count),
      leadsByStatus: byStatus.map((r) => ({ status: r.status, count: r._count._all })),
      monthlyEnquiries: bucketByMonth(createdDates.map((l) => l.createdAt), months),
      monthlySiteVisits: visitsMonthly.map((m, i) => ({ ...m, completed: completedMonthly[i]!.count })),
      monthlyDeals: wonMonthly.map((m, i) => ({ ...m, lost: lostMonthly[i]!.count })),
      agenda: {
        followUps: agendaFollowUps.map(toFollowUpView),
        siteVisits: agendaVisits.map((v) => toSiteVisitView(v, this.urls)),
      },
    };
  }

  /** Personal reminder counts for the header bell: items assigned to the caller, within their visible scope. */
  async reminders(ctx: TenantContext, now = new Date()): Promise<ReminderCounts> {
    const mine = { assignedUserId: ctx.userId };
    const { start, end } = istDayRange(now);
    const [overdue, today, visits] = await Promise.all([
      this.prisma.followUp.count({ where: { AND: [followUpScope(ctx), mine, followUpViewWhere('overdue', now)] } }),
      this.prisma.followUp.count({ where: { AND: [followUpScope(ctx), mine, followUpViewWhere('today', now)] } }),
      this.prisma.siteVisit.count({
        where: { AND: [siteVisitScope(ctx), mine, { status: { in: [SiteVisitStatus.SCHEDULED, SiteVisitStatus.RESCHEDULED] }, scheduledAt: { gte: start, lt: end } }] },
      }),
    ]);
    return { overdueFollowUps: overdue, followUpsDueToday: today, siteVisitsToday: visits };
  }
}
