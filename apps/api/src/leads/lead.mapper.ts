import type { LeadActivityView, LeadView } from '@brokerdesk/shared-types';
import type { Prisma } from '../generated/prisma/client.js';

export const leadSelect = {
  id: true,
  name: true,
  phone: true,
  email: true,
  source: true,
  budgetMin: true,
  budgetMax: true,
  preferredLocation: true,
  bhk: true,
  propertyType: true,
  listingType: true,
  areaMin: true,
  areaMax: true,
  areaUnit: true,
  status: true,
  priority: true,
  nextFollowUpAt: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  assignedUser: { select: { id: true, name: true } },
} as const satisfies Prisma.LeadSelect;

export type LeadRow = Prisma.LeadGetPayload<{ select: typeof leadSelect }>;

/** Decimal → number. INR amounts up to 1e12 with 2 decimals are exact in a double. */
function num(value: Prisma.Decimal | null): number | null {
  return value === null ? null : value.toNumber();
}

export function toLeadView(l: LeadRow): LeadView {
  return {
    ...l,
    budgetMin: num(l.budgetMin),
    budgetMax: num(l.budgetMax),
    areaMin: num(l.areaMin),
    areaMax: num(l.areaMax),
    nextFollowUpAt: l.nextFollowUpAt?.toISOString() ?? null,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}

export const activitySelect = {
  id: true,
  activityType: true,
  description: true,
  createdAt: true,
  user: { select: { id: true, name: true } },
} as const satisfies Prisma.LeadActivitySelect;

export type ActivityRow = Prisma.LeadActivityGetPayload<{ select: typeof activitySelect }>;

export function toActivityView(a: ActivityRow): LeadActivityView {
  return { ...a, createdAt: a.createdAt.toISOString() };
}
