import { BadRequestException, Injectable } from '@nestjs/common';
import {
  type LeadSource,
  type ReportExportSection,
  type ReportSummary,
  type ReportTeamRow,
  canSeeAllLeads,
  percent,
} from '@brokerdesk/shared-types';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import type { TenantContext } from '../common/auth/auth.types.js';
import type { RequestMeta } from '../common/http/request-meta.js';
import { toCsv } from '../common/utils/csv.js';
import { followUpScope } from '../follow-ups/follow-ups.service.js';
import { FollowUpStatus, LeadStatus, SiteVisitStatus } from '../generated/prisma/enums.js';
import { leadScope } from '../leads/lead-query.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { siteVisitScope } from '../site-visits/site-visits.service.js';
import { type ReportRange, resolveReportRange } from './report-range.js';

const SOURCE_NAMES: Readonly<Record<LeadSource, string>> = {
  WALK_IN: 'Walk-in', PHONE: 'Phone call', WHATSAPP: 'WhatsApp', REFERRAL: 'Referral', WEBSITE: 'Website',
  PROPERTY_PORTAL: 'Property portal', SOCIAL_MEDIA: 'Social media', NEWSPAPER: 'Newspaper', ENQUIRY_FORM: 'Online enquiry form', OTHER: 'Other',
};

type Counter = Map<string | null, number>;
const tally = (rows: readonly { assignedUserId: string | null; _count: { _all: number } }[]): Counter =>
  new Map(rows.map((r) => [r.assignedUserId, r._count._all]));

/**
 * Business reports for an IST date range, scoped like the rest of the app:
 * owners/admins see the agency, agents see their own leads and work.
 * See `ReportSummary` for the definitions of every number.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  range(from: string | undefined, to: string | undefined): ReportRange {
    const r = resolveReportRange(from, to);
    if ('error' in r) throw new BadRequestException(r.error);
    return r;
  }

  async summary(ctx: TenantContext, range: ReportRange): Promise<ReportSummary> {
    const leads = leadScope(ctx);
    const created = { gte: range.start, lt: range.end };
    const newLeadsWhere = { ...leads, createdAt: created };
    const closedWhere = (status: LeadStatus) => ({ ...leads, status, closedAt: created });
    const fuDone = { AND: [followUpScope(ctx), { status: FollowUpStatus.COMPLETED, completedAt: created }] };
    const visitsIn = { AND: [siteVisitScope(ctx), { scheduledAt: created }] };
    const visitsDone = { AND: [siteVisitScope(ctx), { scheduledAt: created, status: SiteVisitStatus.COMPLETED }] };

    const [
      newLeads, won, lost, fuCompleted, visitsScheduled, visitsCompleted,
      bySource, wonBySource, byStatus,
      teamLeads, teamFollowUps, teamVisits, teamWon, teamLost,
      propertyVisits, propertyCompleted, members,
    ] = await Promise.all([
      this.prisma.lead.count({ where: newLeadsWhere }),
      this.prisma.lead.count({ where: closedWhere(LeadStatus.WON) }),
      this.prisma.lead.count({ where: closedWhere(LeadStatus.LOST) }),
      this.prisma.followUp.count({ where: fuDone }),
      this.prisma.siteVisit.count({ where: { AND: [visitsIn, { status: { not: SiteVisitStatus.CANCELLED } }] } }),
      this.prisma.siteVisit.count({ where: visitsDone }),
      this.prisma.lead.groupBy({ by: ['source'], where: newLeadsWhere, _count: { _all: true } }),
      this.prisma.lead.groupBy({ by: ['source'], where: { ...newLeadsWhere, status: LeadStatus.WON }, _count: { _all: true } }),
      this.prisma.lead.groupBy({ by: ['status'], where: newLeadsWhere, _count: { _all: true } }),
      this.prisma.lead.groupBy({ by: ['assignedUserId'], where: newLeadsWhere, _count: { _all: true } }),
      this.prisma.followUp.groupBy({ by: ['assignedUserId'], where: fuDone, _count: { _all: true } }),
      this.prisma.siteVisit.groupBy({ by: ['assignedUserId'], where: visitsDone, _count: { _all: true } }),
      this.prisma.lead.groupBy({ by: ['assignedUserId'], where: closedWhere(LeadStatus.WON), _count: { _all: true } }),
      this.prisma.lead.groupBy({ by: ['assignedUserId'], where: closedWhere(LeadStatus.LOST), _count: { _all: true } }),
      this.prisma.siteVisit.groupBy({
        by: ['propertyId'],
        where: { AND: [visitsIn, { status: { not: SiteVisitStatus.CANCELLED } }] },
        _count: { _all: true },
        orderBy: { _count: { propertyId: 'desc' } },
        take: 5,
      }),
      this.prisma.siteVisit.groupBy({ by: ['propertyId'], where: visitsDone, _count: { _all: true } }),
      this.prisma.agencyMember.findMany({
        where: { agencyId: ctx.agencyId, ...(canSeeAllLeads(ctx.role) ? {} : { userId: ctx.userId }) },
        select: { userId: true, role: true, user: { select: { name: true } } },
        orderBy: { joinedAt: 'asc' },
      }),
    ]);

    const wonSource = new Map(wonBySource.map((r) => [r.source, r._count._all]));
    const sources = bySource
      .map((r) => {
        const w = wonSource.get(r.source) ?? 0;
        return { source: r.source, leads: r._count._all, won: w, conversionRate: percent(w, r._count._all) };
      })
      .sort((a, b) => b.leads - a.leads);

    const counters = [tally(teamLeads), tally(teamFollowUps), tally(teamVisits), tally(teamWon), tally(teamLost)] as const;
    const row = (userId: string | null, name: string, role: ReportTeamRow['role']): ReportTeamRow => ({
      userId, name, role,
      newLeads: counters[0].get(userId) ?? 0,
      followUpsCompleted: counters[1].get(userId) ?? 0,
      siteVisitsCompleted: counters[2].get(userId) ?? 0,
      wonDeals: counters[3].get(userId) ?? 0,
      lostDeals: counters[4].get(userId) ?? 0,
    });
    const team = members.map((m) => row(m.userId, m.user.name, m.role));
    if (canSeeAllLeads(ctx.role)) {
      const unassigned = row(null, 'Unassigned', null);
      if (unassigned.newLeads + unassigned.followUpsCompleted + unassigned.siteVisitsCompleted + unassigned.wonDeals + unassigned.lostDeals > 0) {
        team.push(unassigned);
      }
      // Former members still own historical work: show it rather than lose it from the totals.
      const known = new Set<string | null>([...members.map((m) => m.userId), null]);
      const formerIds = [...new Set(counters.flatMap((c) => [...c.keys()]))].filter((id): id is string => !known.has(id));
      if (formerIds.length > 0) {
        const former = await this.prisma.user.findMany({ where: { id: { in: formerIds } }, select: { id: true, name: true } });
        team.push(...former.map((u) => row(u.id, `${u.name} (former member)`, null)));
      }
    }

    const completedByProperty = new Map(propertyCompleted.map((r) => [r.propertyId, r._count._all]));
    const props = propertyVisits.length
      ? await this.prisma.property.findMany({ where: { agencyId: ctx.agencyId, id: { in: propertyVisits.map((p) => p.propertyId) } }, select: { id: true, title: true, location: true } })
      : [];
    const propById = new Map(props.map((p) => [p.id, p]));
    const topProperties = propertyVisits.flatMap((p) => {
      const prop = propById.get(p.propertyId);
      return prop ? [{ ...prop, visits: p._count._all, completed: completedByProperty.get(p.propertyId) ?? 0 }] : [];
    });

    return {
      range: { from: range.from, to: range.to },
      scope: canSeeAllLeads(ctx.role) ? 'agency' : 'mine',
      totals: {
        newLeads,
        wonDeals: won,
        lostDeals: lost,
        winRate: won + lost === 0 ? null : percent(won, won + lost),
        followUpsCompleted: fuCompleted,
        siteVisitsScheduled: visitsScheduled,
        siteVisitsCompleted: visitsCompleted,
      },
      sources,
      funnel: byStatus.map((r) => ({ status: r.status, count: r._count._all })),
      team,
      topProperties,
    };
  }

  /** CSV of one report section (owners/admins). Audited. */
  async exportCsv(ctx: TenantContext, range: ReportRange, section: ReportExportSection, meta: RequestMeta): Promise<string> {
    const r = await this.summary(ctx, range);
    const csv =
      section === 'sources'
        ? toCsv(['Source', 'New leads', 'Won (so far)', 'Conversion %'], r.sources.map((s) => [SOURCE_NAMES[s.source], s.leads, s.won, s.conversionRate]))
        : toCsv(
            ['Team member', 'Role', 'New leads', 'Follow-ups done', 'Site visits done', 'Deals won', 'Deals lost'],
            r.team.map((t) => [t.name, t.role ?? '', t.newLeads, t.followUpsCompleted, t.siteVisitsCompleted, t.wonDeals, t.lostDeals]),
          );
    await this.audit.record({
      action: AuditAction.REPORT_EXPORTED,
      agencyId: ctx.agencyId,
      actorUserId: ctx.userId,
      entityType: 'report',
      metadata: { section, from: range.from, to: range.to },
      meta,
    });
    return csv;
  }
}
