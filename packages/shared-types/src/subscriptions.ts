import type { SubscriptionPlan, SubscriptionStatus } from './enums.js';

/** A plan from the (server-configured) catalogue. Prices are integer paise (₹1 = 100). */
export interface PlanInfo {
  readonly plan: SubscriptionPlan;
  readonly displayName: string;
  readonly monthlyPricePaise: number;
  /** null = unlimited. */
  readonly leadLimit: number | null;
  readonly userLimit: number | null;
}

export interface SubscriptionSummary {
  readonly plan: SubscriptionPlan;
  readonly displayName: string;
  readonly status: SubscriptionStatus;
  readonly startsAt: string;
  readonly expiresAt: string | null;
  /**
   * False when the subscription is cancelled/expired (or past its end date):
   * Free-plan limits then apply until it is renewed. Nothing is deleted.
   */
  readonly active: boolean;
  /** Limits in force right now (null = unlimited). */
  readonly limits: { readonly leads: number | null; readonly users: number | null };
  readonly usage: { readonly leads: number; readonly members: number; readonly pendingInvitations: number };
  /** The plan catalogue, cheapest first, for comparison. */
  readonly plans: readonly PlanInfo[];
  /** Where upgrade requests go / who to contact (no online payment). */
  readonly salesContact: string | null;
  /** When someone in this agency last asked for an upgrade, if ever. */
  readonly lastUpgradeRequestAt: string | null;
}

export interface UpgradeRequestBody {
  readonly plan: SubscriptionPlan;
  readonly note?: string;
}

/** Share of a limit used, for meters. null limit → null (unlimited). */
export function usageRatio(used: number, limit: number | null): number | null {
  if (limit === null) return null;
  if (limit <= 0) return 1;
  return Math.min(1, used / limit);
}
