import { formatInrShort, type MatchCriterion, type MatchStatus, type MatchSummary } from '@brokerdesk/shared-types';
import type { AreaUnit, ListingType, PropertyType } from '../generated/prisma/enums.js';

/**
 * Deterministic, explainable buyer ↔ property matching.
 *
 * Pure functions only (no database, no framework, no randomness): the same lead
 * and property always give the same result, and every point of the score is
 * explained by a criterion the broker can read. There is no opaque AI scoring.
 *
 * Score: each criterion the buyer specified is worth 2 points — "match" = 2,
 * "near" = 1, "miss" = 0. Criteria the buyer left open ("any") or the property
 * lacks data for ("unknown") are shown but not scored. score = points / max × 100.
 */

export interface BuyerRequirement {
  readonly listingType: ListingType;
  readonly budgetMin: number | null;
  readonly budgetMax: number | null;
  readonly preferredLocation: string | null;
  readonly bhk: number | null;
  readonly propertyType: PropertyType | null;
  readonly areaMin: number | null;
  readonly areaMax: number | null;
  readonly areaUnit: AreaUnit | null;
}

export interface PropertyFacts {
  readonly listingType: ListingType;
  readonly price: number;
  readonly location: string;
  readonly city: string;
  readonly projectName: string | null;
  readonly bhk: number | null;
  readonly propertyType: PropertyType;
  readonly area: number | null;
  readonly areaUnit: AreaUnit;
}

/** Up to this fraction over budget (or outside the area range) counts as "near". */
export const NEAR_TOLERANCE = 0.1;

const SQFT_PER: Readonly<Record<AreaUnit, number>> = { SQFT: 1, SQYD: 9, SQM: 10.7639 };
const UNIT_LABEL: Readonly<Record<AreaUnit, string>> = { SQFT: 'sq ft', SQYD: 'sq yd', SQM: 'sq m' };

const TYPE_LABEL: Readonly<Record<PropertyType, string>> = {
  APARTMENT: 'Apartment', BUNGALOW: 'Bungalow', ROW_HOUSE: 'Row house', TENEMENT: 'Tenement',
  PENTHOUSE: 'Penthouse', PLOT: 'Plot', SHOP: 'Shop', OFFICE: 'Office', OTHER: 'Other',
};

/** Similar property types are a "near" match (e.g. a buyer for a bungalow may consider a row house). */
const TYPE_FAMILY: Readonly<Record<PropertyType, string>> = {
  APARTMENT: 'flat', PENTHOUSE: 'flat',
  BUNGALOW: 'house', ROW_HOUSE: 'house', TENEMENT: 'house',
  SHOP: 'commercial', OFFICE: 'commercial',
  PLOT: 'plot', OTHER: 'other',
};

const pct = (n: number): string => `${Math.round(n * 100)}%`;
const criterion = (key: MatchCriterion['key'], status: MatchStatus, detail: string): MatchCriterion => ({ key, status, detail });

export function matchListingType(req: BuyerRequirement, p: PropertyFacts): MatchCriterion {
  const label = (t: ListingType): string => (t === 'RENT' ? 'rent' : 'sale');
  return req.listingType === p.listingType
    ? criterion('listingType', 'match', `For ${label(p.listingType)}, as wanted`)
    : criterion('listingType', 'miss', `For ${label(p.listingType)}, buyer wants to ${req.listingType === 'RENT' ? 'rent' : 'buy'}`);
}

export function matchBudget(req: BuyerRequirement, p: PropertyFacts): MatchCriterion {
  const { budgetMin: min, budgetMax: max } = req;
  const price = formatInrShort(p.price);
  if (min === null && max === null) return criterion('budget', 'any', `${price}; no budget given`);
  if (max !== null && p.price > max) {
    const over = (p.price - max) / max;
    return over <= NEAR_TOLERANCE
      ? criterion('budget', 'near', `${price} is ${pct(over)} over the ${formatInrShort(max)} budget`)
      : criterion('budget', 'miss', `${price} is ${pct(over)} over the ${formatInrShort(max)} budget`);
  }
  if (min !== null && p.price < min) {
    // Cheaper than the buyer's minimum is not disqualifying, but worth pointing out.
    return criterion('budget', 'near', `${price} is below the ${formatInrShort(min)} minimum`);
  }
  const range =
    min !== null && max !== null ? `${formatInrShort(min)}–${formatInrShort(max)}`
    : max !== null ? `up to ${formatInrShort(max)}`
    : `from ${formatInrShort(min ?? 0)}`;
  return criterion('budget', 'match', `${price} is within the budget (${range})`);
}

/** "Shela, Bopal / Gota" → ["shela", "bopal", "gota"] */
export function locationTokens(preferred: string): string[] {
  return preferred
    .toLowerCase()
    .split(/[,/;|&]|\bor\b|\band\b/)
    .map((t) => t.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((t) => t.length >= 2);
}

export function matchLocation(req: BuyerRequirement, p: PropertyFacts): MatchCriterion {
  if (!req.preferredLocation?.trim()) return criterion('location', 'any', `In ${p.location}; no area preference`);
  const wanted = locationTokens(req.preferredLocation);
  if (wanted.length === 0) return criterion('location', 'any', `In ${p.location}; no area preference`);
  const places = [p.location, p.city, p.projectName ?? '']
    .map((s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const hit = wanted.find((w) => places.some((place) => place.includes(w) || (place.length >= 3 && w.includes(place))));
  return hit
    ? criterion('location', 'match', `In ${p.location}, a preferred area`)
    : criterion('location', 'miss', `In ${p.location}; buyer prefers ${req.preferredLocation.trim()}`);
}

export function matchBhk(req: BuyerRequirement, p: PropertyFacts): MatchCriterion {
  if (req.bhk === null) return criterion('bhk', 'any', p.bhk ? `${p.bhk} BHK; any size is fine` : 'Any size is fine');
  if (p.bhk === null) return criterion('bhk', 'unknown', `Buyer wants ${req.bhk} BHK; BHK not listed for this property`);
  const diff = Math.abs(p.bhk - req.bhk);
  if (diff === 0) return criterion('bhk', 'match', `${p.bhk} BHK, as wanted`);
  return criterion('bhk', diff === 1 ? 'near' : 'miss', `${p.bhk} BHK; buyer wants ${req.bhk} BHK`);
}

export function matchPropertyType(req: BuyerRequirement, p: PropertyFacts): MatchCriterion {
  if (req.propertyType === null) return criterion('propertyType', 'any', `${TYPE_LABEL[p.propertyType]}; any type is fine`);
  if (req.propertyType === p.propertyType) return criterion('propertyType', 'match', `${TYPE_LABEL[p.propertyType]}, as wanted`);
  const sameFamily = TYPE_FAMILY[req.propertyType] === TYPE_FAMILY[p.propertyType] && TYPE_FAMILY[p.propertyType] !== 'other';
  return criterion(
    'propertyType',
    sameFamily ? 'near' : 'miss',
    `${TYPE_LABEL[p.propertyType]}; buyer wants ${TYPE_LABEL[req.propertyType]}`,
  );
}

export function matchArea(req: BuyerRequirement, p: PropertyFacts): MatchCriterion {
  if (req.areaMin === null && req.areaMax === null) return criterion('area', 'any', 'No area requirement');
  if (p.area === null) return criterion('area', 'unknown', 'Area not listed for this property');
  const reqUnit = req.areaUnit ?? 'SQFT';
  const toSqft = (v: number, unit: AreaUnit): number => v * SQFT_PER[unit];
  const area = toSqft(p.area, p.areaUnit);
  const min = req.areaMin === null ? null : toSqft(req.areaMin, reqUnit);
  const max = req.areaMax === null ? null : toSqft(req.areaMax, reqUnit);
  const shown = `${p.area} ${UNIT_LABEL[p.areaUnit]}`;
  const wanted =
    req.areaMin !== null && req.areaMax !== null ? `${req.areaMin}–${req.areaMax} ${UNIT_LABEL[reqUnit]}`
    : req.areaMin !== null ? `at least ${req.areaMin} ${UNIT_LABEL[reqUnit]}`
    : `up to ${req.areaMax} ${UNIT_LABEL[reqUnit]}`;

  const below = min !== null && area < min ? (min - area) / min : 0;
  const above = max !== null && area > max ? (area - max) / max : 0;
  if (below === 0 && above === 0) return criterion('area', 'match', `${shown}, within ${wanted}`);
  const off = Math.max(below, above);
  return criterion('area', off <= NEAR_TOLERANCE ? 'near' : 'miss', `${shown}; buyer wants ${wanted}`);
}

const POINTS: Readonly<Record<MatchStatus, number | null>> = { match: 2, near: 1, miss: 0, any: null, unknown: null };

/** Full explainable evaluation of one property for one buyer. */
export function evaluateMatch(req: BuyerRequirement, p: PropertyFacts): MatchSummary {
  const criteria = [
    matchListingType(req, p),
    matchBudget(req, p),
    matchLocation(req, p),
    matchBhk(req, p),
    matchPropertyType(req, p),
    matchArea(req, p),
  ];
  const scored = criteria.filter((c) => POINTS[c.status] !== null);
  const points = scored.reduce((sum, c) => sum + (POINTS[c.status] ?? 0), 0);
  const max = scored.length * 2;
  return {
    score: max === 0 ? 0 : Math.round((points / max) * 100),
    criteria,
    matched: criteria.filter((c) => c.status === 'match').length,
    near: criteria.filter((c) => c.status === 'near').length,
    missed: criteria.filter((c) => c.status === 'miss').length,
  };
}

/** Best first: higher score, then fewer misses, then price closest to the buyer's maximum. */
export function compareMatches(
  a: { summary: MatchSummary; price: number },
  b: { summary: MatchSummary; price: number },
  budgetMax: number | null,
): number {
  if (b.summary.score !== a.summary.score) return b.summary.score - a.summary.score;
  if (a.summary.missed !== b.summary.missed) return a.summary.missed - b.summary.missed;
  if (budgetMax !== null) return Math.abs(a.price - budgetMax) - Math.abs(b.price - budgetMax);
  return 0;
}
