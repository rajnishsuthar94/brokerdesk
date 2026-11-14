import type { AvailabilityStatus, LeadStatus, ListingType, PropertyType } from './enums.js';

export const MATCH_CRITERIA = ['listingType', 'budget', 'location', 'bhk', 'propertyType', 'area'] as const;
export type MatchCriterionKey = (typeof MATCH_CRITERIA)[number];

/**
 * - match:   fully satisfies the buyer's requirement
 * - near:    close (e.g. up to 10% over budget, ±1 BHK, area within 10%)
 * - miss:    does not satisfy it
 * - any:     the buyer did not specify this, so it is not scored
 * - unknown: the buyer specified it but the property has no value to compare
 */
export type MatchStatus = 'match' | 'near' | 'miss' | 'any' | 'unknown';

export interface MatchCriterion {
  readonly key: MatchCriterionKey;
  readonly status: MatchStatus;
  /** Plain-language explanation, e.g. "₹92 L is 2% over the ₹90 L budget". */
  readonly detail: string;
}

export interface MatchSummary {
  /** 0–100. match = full points, near = half, miss = 0; "any"/"unknown" are not scored. */
  readonly score: number;
  readonly criteria: readonly MatchCriterion[];
  readonly matched: number;
  readonly near: number;
  readonly missed: number;
}

export interface PropertyMatch extends MatchSummary {
  readonly property: {
    readonly id: string;
    readonly title: string;
    readonly location: string;
    readonly city: string;
    readonly price: number;
    readonly listingType: ListingType;
    readonly propertyType: PropertyType;
    readonly bhk: number | null;
    readonly availabilityStatus: AvailabilityStatus;
    readonly coverImageUrl: string | null;
  };
}

export interface LeadMatch extends MatchSummary {
  readonly lead: {
    readonly id: string;
    readonly name: string;
    readonly phone: string;
    readonly status: LeadStatus;
    readonly budgetMin: number | null;
    readonly budgetMax: number | null;
    readonly preferredLocation: string | null;
    readonly bhk: number | null;
  };
}
