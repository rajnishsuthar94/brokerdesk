import { SubscriptionPlan, SubscriptionStatus } from '../generated/prisma/enums.js';

/**
 * Subscription plan catalogue.
 *
 * The defaults below are initial business hypotheses, not final pricing. Any
 * field can be overridden per plan with the `PLAN_CATALOG_JSON` environment
 * variable (validated at boot). Limits are snapshotted onto each agency's
 * `subscriptions` row when its plan is set, so changing the catalogue never
 * silently changes an existing customer's limits.
 *
 * Prices are integers in paise (₹1 = 100 paise) to avoid floating-point money.
 * `null` limit = unlimited.
 */
export interface PlanDefinition {
  readonly plan: SubscriptionPlan;
  readonly displayName: string;
  readonly monthlyPricePaise: number;
  readonly leadLimit: number | null;
  readonly userLimit: number | null;
}

export type PlanCatalog = Readonly<Record<SubscriptionPlan, PlanDefinition>>;
export type PlanOverrides = Partial<Record<SubscriptionPlan, Partial<Omit<PlanDefinition, 'plan'>>>>;

export const PLAN_ORDER: readonly SubscriptionPlan[] = [
  SubscriptionPlan.FREE,
  SubscriptionPlan.STARTER,
  SubscriptionPlan.PROFESSIONAL,
  SubscriptionPlan.BUSINESS,
];

export const DEFAULT_PLAN_CATALOG: PlanCatalog = {
  [SubscriptionPlan.FREE]: { plan: SubscriptionPlan.FREE, displayName: 'Free', monthlyPricePaise: 0, leadLimit: 25, userLimit: 1 },
  [SubscriptionPlan.STARTER]: { plan: SubscriptionPlan.STARTER, displayName: 'Starter', monthlyPricePaise: 499_00, leadLimit: 250, userLimit: 1 },
  [SubscriptionPlan.PROFESSIONAL]: { plan: SubscriptionPlan.PROFESSIONAL, displayName: 'Professional', monthlyPricePaise: 999_00, leadLimit: 1000, userLimit: 3 },
  [SubscriptionPlan.BUSINESS]: { plan: SubscriptionPlan.BUSINESS, displayName: 'Business', monthlyPricePaise: 1999_00, leadLimit: null, userLimit: 5 },
};

/** Defaults merged with validated overrides. */
export function buildCatalog(overrides: PlanOverrides = {}): PlanCatalog {
  const merged = {} as Record<SubscriptionPlan, PlanDefinition>;
  for (const plan of PLAN_ORDER) {
    merged[plan] = { ...DEFAULT_PLAN_CATALOG[plan], ...overrides[plan], plan };
  }
  return merged;
}

const LIMIT_KEYS = ['leadLimit', 'userLimit'] as const;

/**
 * Parses and validates `PLAN_CATALOG_JSON`, e.g.
 * `{"STARTER":{"monthlyPricePaise":59900,"leadLimit":300}}`. Returns problems
 * instead of throwing so env validation can report them all at once.
 */
export function parsePlanOverrides(raw: string | undefined): { overrides: PlanOverrides; problems: string[] } {
  const problems: string[] = [];
  if (!raw?.trim()) return { overrides: {}, problems };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { overrides: {}, problems: ['PLAN_CATALOG_JSON is not valid JSON'] };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { overrides: {}, problems: ['PLAN_CATALOG_JSON must be an object keyed by plan (FREE, STARTER, …)'] };
  }
  const overrides: PlanOverrides = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!(PLAN_ORDER as readonly string[]).includes(key)) {
      problems.push(`PLAN_CATALOG_JSON: unknown plan "${key}"`);
      continue;
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      problems.push(`PLAN_CATALOG_JSON.${key} must be an object`);
      continue;
    }
    const entry: { -readonly [K in keyof Omit<PlanDefinition, 'plan'>]?: PlanDefinition[K] } = {};
    for (const [field, v] of Object.entries(value as Record<string, unknown>)) {
      if (field === 'displayName') {
        if (typeof v === 'string' && v.trim().length > 0 && v.length <= 40) entry.displayName = v.trim();
        else problems.push(`PLAN_CATALOG_JSON.${key}.displayName must be 1–40 characters`);
      } else if (field === 'monthlyPricePaise') {
        if (Number.isSafeInteger(v) && (v as number) >= 0) entry.monthlyPricePaise = v as number;
        else problems.push(`PLAN_CATALOG_JSON.${key}.monthlyPricePaise must be a whole number of paise >= 0`);
      } else if ((LIMIT_KEYS as readonly string[]).includes(field)) {
        if (v === null || (Number.isSafeInteger(v) && (v as number) >= 1)) entry[field as (typeof LIMIT_KEYS)[number]] = v as number | null;
        else problems.push(`PLAN_CATALOG_JSON.${key}.${field} must be a whole number >= 1, or null for unlimited`);
      } else {
        problems.push(`PLAN_CATALOG_JSON.${key}: unknown field "${field}"`);
      }
    }
    overrides[key as SubscriptionPlan] = entry;
  }
  return { overrides, problems };
}

export interface SubscriptionState {
  readonly plan: SubscriptionPlan;
  readonly status: SubscriptionStatus;
  readonly expiresAt: Date | null;
  readonly leadLimit: number | null;
  readonly userLimit: number | null;
}

const LIVE: readonly SubscriptionStatus[] = [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING, SubscriptionStatus.PAST_DUE];

/**
 * Limits in force now. A live subscription (active, trialing, or past due — a
 * grace period while payment is sorted out offline) uses its snapshotted
 * limits; a cancelled/expired one, or one past its end date, falls back to the
 * Free plan's limits. Existing data is never removed — only adding beyond the
 * Free limits is blocked until renewal.
 */
export function effectiveLimits(
  sub: SubscriptionState | null,
  catalog: PlanCatalog,
  now: Date = new Date(),
): { active: boolean; leadLimit: number | null; userLimit: number | null } {
  const free = catalog[SubscriptionPlan.FREE];
  if (!sub) return { active: false, leadLimit: free.leadLimit, userLimit: free.userLimit };
  const live = LIVE.includes(sub.status) && (sub.expiresAt === null || sub.expiresAt.getTime() > now.getTime());
  if (!live) return { active: false, leadLimit: free.leadLimit, userLimit: free.userLimit };
  return { active: true, leadLimit: sub.leadLimit, userLimit: sub.userLimit };
}

/** Data for putting an agency on `plan` now, for `months` months (null = no end date). */
export function planChange(
  catalog: PlanCatalog,
  plan: SubscriptionPlan,
  months: number | null,
  now: Date = new Date(),
): { plan: SubscriptionPlan; status: SubscriptionStatus; leadLimit: number | null; userLimit: number | null; startsAt: Date; expiresAt: Date | null } {
  const def = catalog[plan];
  let expiresAt: Date | null = null;
  if (months !== null) {
    expiresAt = new Date(now);
    expiresAt.setUTCMonth(expiresAt.getUTCMonth() + months);
  }
  return { plan, status: SubscriptionStatus.ACTIVE, leadLimit: def.leadLimit, userLimit: def.userLimit, startsAt: now, expiresAt };
}
