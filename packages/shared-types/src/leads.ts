import type {
  AreaUnit,
  LeadActivityType,
  LeadPriority,
  LeadSource,
  LeadStatus,
  ListingType,
  PropertyType,
} from './enums.js';

export interface UserRef {
  readonly id: string;
  readonly name: string;
}

/** A lead as returned by the API. Money values are rupees (number). Dates are ISO strings (UTC). */
export interface LeadView {
  readonly id: string;
  readonly name: string;
  /** E.164, e.g. +919876543210. */
  readonly phone: string;
  readonly email: string | null;
  readonly source: LeadSource;
  readonly budgetMin: number | null;
  readonly budgetMax: number | null;
  readonly preferredLocation: string | null;
  readonly bhk: number | null;
  readonly propertyType: PropertyType | null;
  readonly listingType: ListingType;
  readonly areaMin: number | null;
  readonly areaMax: number | null;
  readonly areaUnit: AreaUnit | null;
  readonly status: LeadStatus;
  readonly priority: LeadPriority;
  readonly nextFollowUpAt: string | null;
  readonly notes: string | null;
  readonly assignedUser: UserRef | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Editable lead fields (create/update). Omitted = unchanged on update; null clears. */
export interface LeadInput {
  readonly name: string;
  readonly phone: string;
  readonly email?: string | null;
  readonly source?: LeadSource;
  readonly budgetMin?: number | null;
  readonly budgetMax?: number | null;
  readonly preferredLocation?: string | null;
  readonly bhk?: number | null;
  readonly propertyType?: PropertyType | null;
  readonly listingType?: ListingType;
  readonly areaMin?: number | null;
  readonly areaMax?: number | null;
  readonly areaUnit?: AreaUnit | null;
  readonly status?: LeadStatus;
  readonly priority?: LeadPriority;
  readonly nextFollowUpAt?: string | null;
  readonly notes?: string | null;
  /** Owners/admins only; agents' leads are always assigned to themselves. */
  readonly assignedUserId?: string | null;
  /** Create anyway even if a lead with the same phone exists. */
  readonly allowDuplicate?: boolean;
}

export const LEAD_SORT_FIELDS = ['createdAt', 'updatedAt', 'name', 'nextFollowUpAt', 'budgetMax', 'priority', 'status'] as const;
export type LeadSortField = (typeof LEAD_SORT_FIELDS)[number];

export const FOLLOW_UP_FILTERS = ['overdue', 'today', 'upcoming', 'none'] as const;
export type FollowUpFilter = (typeof FOLLOW_UP_FILTERS)[number];

/** Query parameters of GET /leads (all optional). */
export interface LeadListQuery {
  readonly search?: string;
  readonly status?: readonly LeadStatus[];
  readonly priority?: readonly LeadPriority[];
  readonly source?: readonly LeadSource[];
  readonly listingType?: ListingType;
  readonly propertyType?: PropertyType;
  /** A member's user id, or "me" / "unassigned". */
  readonly assignedTo?: string;
  readonly followUp?: FollowUpFilter;
  readonly sort?: LeadSortField;
  readonly order?: 'asc' | 'desc';
  readonly page?: number;
  readonly pageSize?: number;
}

export const LEAD_ACTIVITY_TYPES_USER = ['NOTE', 'CALL', 'WHATSAPP', 'EMAIL', 'MEETING'] as const;
export type UserLeadActivityType = (typeof LEAD_ACTIVITY_TYPES_USER)[number];

export interface LeadActivityView {
  readonly id: string;
  readonly activityType: LeadActivityType;
  readonly description: string;
  readonly user: UserRef | null;
  readonly createdAt: string;
}

/** 409 body when creating a lead whose phone already exists in the agency. */
export interface DuplicateLeadError {
  readonly statusCode: 409;
  readonly code: 'DUPLICATE_LEAD';
  readonly message: string;
  readonly existingLead: { readonly id: string; readonly name: string };
}

export type ImportDuplicateStrategy = 'skip' | 'create';

export interface LeadImportRowIssue {
  /** 1-based data row number (excluding the header row). */
  readonly row: number;
  readonly name: string;
  readonly messages: readonly string[];
}

export interface LeadImportDuplicate {
  readonly row: number;
  readonly name: string;
  readonly phone: string;
  /** 'existing' = already in BrokerDesk; 'file' = repeated earlier in the same file. */
  readonly kind: 'existing' | 'file';
  readonly existingLeadName?: string;
}

export interface LeadImportResult {
  readonly mode: 'preview' | 'commit';
  readonly totalRows: number;
  readonly validRows: number;
  readonly invalid: readonly LeadImportRowIssue[];
  readonly duplicates: readonly LeadImportDuplicate[];
  /** Rows that will be / were created. */
  readonly toCreate: number;
  /** Only in commit mode. */
  readonly created: number;
}
