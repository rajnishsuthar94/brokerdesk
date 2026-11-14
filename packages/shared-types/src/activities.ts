import type { FollowUpStatus, LeadSource, LeadStatus, SiteVisitStatus } from './enums.js';
import type { UserRef } from './leads.js';

export interface LeadRef {
  readonly id: string;
  readonly name: string;
  readonly phone: string;
  readonly status: LeadStatus;
}

// ── Follow-ups ───────────────────────────────────────────────────────────────

export const FOLLOW_UP_VIEWS = ['today', 'overdue', 'upcoming', 'completed', 'cancelled', 'all'] as const;
export type FollowUpListView = (typeof FOLLOW_UP_VIEWS)[number];

export interface FollowUpView {
  readonly id: string;
  readonly lead: LeadRef;
  readonly assignedUser: UserRef | null;
  readonly dueAt: string;
  readonly status: FollowUpStatus;
  readonly notes: string | null;
  readonly completedAt: string | null;
  readonly createdAt: string;
}

export interface CreateFollowUpRequest {
  readonly leadId: string;
  readonly dueAt: string;
  readonly notes?: string;
  /** Owners/admins only. */
  readonly assignedUserId?: string | null;
}

export interface CompleteFollowUpRequest {
  /** What happened on the call / meeting. */
  readonly outcome?: string;
  /** Optionally schedule the next follow-up in the same step. */
  readonly nextDueAt?: string;
}

// ── Site visits ──────────────────────────────────────────────────────────────

export const SITE_VISIT_VIEWS = ['upcoming', 'past', 'all'] as const;
export type SiteVisitListView = (typeof SITE_VISIT_VIEWS)[number];

export interface SiteVisitView {
  readonly id: string;
  readonly lead: LeadRef;
  readonly property: { readonly id: string; readonly title: string; readonly location: string; readonly coverImageUrl: string | null };
  readonly assignedUser: UserRef | null;
  readonly scheduledAt: string;
  readonly status: SiteVisitStatus;
  readonly feedback: string | null;
  readonly createdAt: string;
}

export interface CreateSiteVisitRequest {
  readonly leadId: string;
  readonly propertyId: string;
  readonly scheduledAt: string;
  readonly notes?: string;
  readonly assignedUserId?: string | null;
}

// ── Dashboard ────────────────────────────────────────────────────────────────

export interface MonthlyCount {
  /** "YYYY-MM" in IST. */
  readonly month: string;
  readonly count: number;
}

export interface DashboardSummary {
  /** Scope of the numbers: the whole agency (owners/admins) or the agent's own leads. */
  readonly scope: 'agency' | 'mine';
  readonly totals: {
    readonly totalLeads: number;
    readonly newLeadsThisMonth: number;
    readonly followUpsDueToday: number;
    readonly overdueFollowUps: number;
    readonly upcomingSiteVisits: number;
    readonly wonDeals: number;
    readonly lostLeads: number;
    /** Won ÷ total leads, as a percentage with one decimal. */
    readonly conversionRate: number;
  };
  readonly leadsBySource: readonly { readonly source: LeadSource; readonly count: number }[];
  readonly leadsByStatus: readonly { readonly status: LeadStatus; readonly count: number }[];
  /** Last 6 months, oldest first. */
  readonly monthlyEnquiries: readonly MonthlyCount[];
  readonly monthlySiteVisits: readonly (MonthlyCount & { readonly completed: number })[];
  readonly monthlyDeals: readonly (MonthlyCount & { readonly lost: number })[];
  /** Reminders: overdue + today's follow-ups (earliest first) and the next site visits. */
  readonly agenda: {
    readonly followUps: readonly FollowUpView[];
    readonly siteVisits: readonly SiteVisitView[];
  };
}

/** The signed-in user's own reminders (header bell). Personal: only items assigned to the caller. */
export interface ReminderCounts {
  readonly overdueFollowUps: number;
  readonly followUpsDueToday: number;
  readonly siteVisitsToday: number;
}
