import type { Prisma } from '../generated/prisma/client.js';
import { FollowUpStatus, LeadStatus, SiteVisitStatus } from '../generated/prisma/enums.js';

/**
 * Follow-ups are the source of truth for "when do I contact this buyer next".
 * `leads.next_follow_up_at` is a denormalised copy (the earliest PENDING
 * follow-up) kept for fast list filters/sorting. Call after every change.
 */
export async function syncNextFollowUp(tx: Prisma.TransactionClient, agencyId: string, leadId: string): Promise<void> {
  const next = await tx.followUp.findFirst({
    where: { agencyId, leadId, status: FollowUpStatus.PENDING },
    orderBy: { dueAt: 'asc' },
    select: { dueAt: true },
  });
  await tx.lead.update({ where: { id: leadId }, data: { nextFollowUpAt: next?.dueAt ?? null } });
}

/**
 * When a lead changes hands, the previous assignee's open follow-ups and visits
 * on it move to the new assignee (an agent who lost the lead could no longer see
 * them, and nobody else would be reminded). Work assigned to others is left alone.
 */
export async function handOverOpenWork(
  tx: Prisma.TransactionClient,
  agencyId: string,
  leadId: string,
  from: string | null,
  to: string | null,
): Promise<void> {
  if (!from || from === to) return;
  await tx.followUp.updateMany({ where: { agencyId, leadId, assignedUserId: from, status: FollowUpStatus.PENDING }, data: { assignedUserId: to } });
  await tx.siteVisit.updateMany({
    where: { agencyId, leadId, assignedUserId: from, status: { in: [SiteVisitStatus.SCHEDULED, SiteVisitStatus.RESCHEDULED] } },
    data: { assignedUserId: to },
  });
}

const CLOSED = new Set<LeadStatus>([LeadStatus.WON, LeadStatus.LOST]);

/**
 * `closed_at` for a status change: set when a lead becomes WON/LOST (or switches
 * between them), cleared when it is reopened, unchanged otherwise.
 * Returns undefined when nothing should change.
 */
export function closedAtFor(next: LeadStatus, previous: LeadStatus | null, now = new Date()): Date | null | undefined {
  if (next === previous) return undefined;
  if (CLOSED.has(next)) return now;
  return previous !== null && CLOSED.has(previous) ? null : undefined;
}
