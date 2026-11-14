/**
 * Domain enumerations shared between the API and the web app.
 *
 * These are plain `as const` objects (not TS `enum`s) so they tree-shake well in
 * the browser and map 1:1 onto the Prisma enums defined in
 * `apps/api/prisma/schema.prisma`. Keep both in sync.
 */

export const MemberRole = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  AGENT: 'AGENT',
} as const;
export type MemberRole = (typeof MemberRole)[keyof typeof MemberRole];

export const LeadStatus = {
  NEW: 'NEW',
  CONTACTED: 'CONTACTED',
  QUALIFIED: 'QUALIFIED',
  SITE_VISIT: 'SITE_VISIT',
  NEGOTIATION: 'NEGOTIATION',
  WON: 'WON',
  LOST: 'LOST',
} as const;
export type LeadStatus = (typeof LeadStatus)[keyof typeof LeadStatus];

export const LeadPriority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
} as const;
export type LeadPriority = (typeof LeadPriority)[keyof typeof LeadPriority];

export const LeadSource = {
  WALK_IN: 'WALK_IN',
  PHONE: 'PHONE',
  WHATSAPP: 'WHATSAPP',
  REFERRAL: 'REFERRAL',
  WEBSITE: 'WEBSITE',
  PROPERTY_PORTAL: 'PROPERTY_PORTAL',
  SOCIAL_MEDIA: 'SOCIAL_MEDIA',
  NEWSPAPER: 'NEWSPAPER',
  ENQUIRY_FORM: 'ENQUIRY_FORM',
  OTHER: 'OTHER',
} as const;
export type LeadSource = (typeof LeadSource)[keyof typeof LeadSource];

export const PropertyType = {
  APARTMENT: 'APARTMENT',
  BUNGALOW: 'BUNGALOW',
  ROW_HOUSE: 'ROW_HOUSE',
  TENEMENT: 'TENEMENT',
  PENTHOUSE: 'PENTHOUSE',
  PLOT: 'PLOT',
  SHOP: 'SHOP',
  OFFICE: 'OFFICE',
  OTHER: 'OTHER',
} as const;
export type PropertyType = (typeof PropertyType)[keyof typeof PropertyType];

export const ListingType = {
  SALE: 'SALE',
  RENT: 'RENT',
} as const;
export type ListingType = (typeof ListingType)[keyof typeof ListingType];

export const AreaUnit = {
  SQFT: 'SQFT',
  SQYD: 'SQYD',
  SQM: 'SQM',
} as const;
export type AreaUnit = (typeof AreaUnit)[keyof typeof AreaUnit];

export const Furnishing = {
  UNFURNISHED: 'UNFURNISHED',
  SEMI_FURNISHED: 'SEMI_FURNISHED',
  FULLY_FURNISHED: 'FULLY_FURNISHED',
} as const;
export type Furnishing = (typeof Furnishing)[keyof typeof Furnishing];

export const AvailabilityStatus = {
  AVAILABLE: 'AVAILABLE',
  ON_HOLD: 'ON_HOLD',
  SOLD: 'SOLD',
  RENTED: 'RENTED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type AvailabilityStatus = (typeof AvailabilityStatus)[keyof typeof AvailabilityStatus];

export const FollowUpStatus = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type FollowUpStatus = (typeof FollowUpStatus)[keyof typeof FollowUpStatus];

export const SiteVisitStatus = {
  SCHEDULED: 'SCHEDULED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  RESCHEDULED: 'RESCHEDULED',
} as const;
export type SiteVisitStatus = (typeof SiteVisitStatus)[keyof typeof SiteVisitStatus];

export const SubscriptionPlan = {
  FREE: 'FREE',
  STARTER: 'STARTER',
  PROFESSIONAL: 'PROFESSIONAL',
  BUSINESS: 'BUSINESS',
} as const;
export type SubscriptionPlan = (typeof SubscriptionPlan)[keyof typeof SubscriptionPlan];

export const SubscriptionStatus = {
  TRIALING: 'TRIALING',
  ACTIVE: 'ACTIVE',
  PAST_DUE: 'PAST_DUE',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
} as const;
export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

export const LeadActivityType = {
  NOTE: 'NOTE',
  CALL: 'CALL',
  WHATSAPP: 'WHATSAPP',
  EMAIL: 'EMAIL',
  MEETING: 'MEETING',
  STATUS_CHANGE: 'STATUS_CHANGE',
  ASSIGNMENT: 'ASSIGNMENT',
  FOLLOW_UP: 'FOLLOW_UP',
  SITE_VISIT: 'SITE_VISIT',
  SYSTEM: 'SYSTEM',
} as const;
export type LeadActivityType = (typeof LeadActivityType)[keyof typeof LeadActivityType];
