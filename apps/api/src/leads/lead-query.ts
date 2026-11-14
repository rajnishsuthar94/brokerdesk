import { canSeeAllLeads } from '@brokerdesk/shared-types';
import type { TenantContext } from '../common/auth/auth.types.js';
import { istDayRange } from '../common/utils/indian-formats.js';
import type { Prisma } from '../generated/prisma/client.js';
import { LeadStatus } from '../generated/prisma/enums.js';
import type { LeadFiltersDto } from './dto/lead.dto.js';

/**
 * The set of leads the caller may see, before any user filters:
 * same agency, not deleted, and — for agents — assigned to them.
 * EVERY lead query must start from this.
 */
export function leadScope(ctx: TenantContext): Prisma.LeadWhereInput {
  return {
    agencyId: ctx.agencyId,
    deletedAt: null,
    ...(canSeeAllLeads(ctx.role) ? {} : { assignedUserId: ctx.userId }),
  };
}

const CLOSED: LeadStatus[] = [LeadStatus.WON, LeadStatus.LOST];

/** Builds the WHERE clause for list/export. Pure (clock passed in) and unit-tested. */
export function buildLeadWhere(ctx: TenantContext, f: LeadFiltersDto, now: Date): Prisma.LeadWhereInput {
  const and: Prisma.LeadWhereInput[] = [leadScope(ctx)];

  if (f.search) {
    const term = f.search;
    const digits = term.replace(/\D/g, '');
    const or: Prisma.LeadWhereInput[] = [
      { name: { contains: term } },
      { email: { contains: term } },
      { preferredLocation: { contains: term } },
    ];
    // Phones are stored as +91XXXXXXXXXX; match on digits so "98250 12345" finds them.
    if (digits.length >= 3) or.push({ phone: { contains: digits } });
    and.push({ OR: or });
  }

  if (f.status?.length) and.push({ status: { in: f.status } });
  if (f.priority?.length) and.push({ priority: { in: f.priority } });
  if (f.source?.length) and.push({ source: { in: f.source } });
  if (f.listingType) and.push({ listingType: f.listingType });
  if (f.propertyType) and.push({ propertyType: f.propertyType });

  if (f.assignedTo === 'me') and.push({ assignedUserId: ctx.userId });
  else if (f.assignedTo === 'unassigned') and.push({ assignedUserId: null });
  else if (f.assignedTo) and.push({ assignedUserId: f.assignedTo });

  if (f.followUp) {
    const { start, end } = istDayRange(now);
    const open = { status: { notIn: CLOSED } };
    switch (f.followUp) {
      case 'overdue':
        and.push(open, { nextFollowUpAt: { lt: now } });
        break;
      case 'today':
        and.push(open, { nextFollowUpAt: { gte: start, lt: end } });
        break;
      case 'upcoming':
        and.push(open, { nextFollowUpAt: { gte: end } });
        break;
      case 'none':
        and.push({ nextFollowUpAt: null });
        break;
    }
  }

  return { AND: and };
}

export function buildLeadOrderBy(f: LeadFiltersDto): Prisma.LeadOrderByWithRelationInput[] {
  const order = f.order ?? (f.sort === 'name' || f.sort === 'nextFollowUpAt' ? 'asc' : 'desc');
  const field = f.sort ?? 'createdAt';
  const primary: Prisma.LeadOrderByWithRelationInput =
    field === 'nextFollowUpAt' || field === 'budgetMax'
      ? { [field]: { sort: order, nulls: 'last' } }
      : { [field]: order };
  // Stable tie-breaker so pagination never repeats or skips rows.
  return [primary, { id: 'desc' }];
}
