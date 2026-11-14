import type { LeadSource, LeadStatus, MemberRole } from './enums.js';

/** Longest range a report may cover. */
export const MAX_REPORT_DAYS = 366;
export const REPORT_EXPORT_SECTIONS = ['team', 'sources'] as const;
export type ReportExportSection = (typeof REPORT_EXPORT_SECTIONS)[number];

/**
 * Report for an IST date range (both ends inclusive).
 *
 * Definitions:
 * - newLeads: leads created in the range.
 * - won/lost deals: leads whose status became WON/LOST in the range (`closed_at`).
 * - winRate: won ÷ (won + lost) closed in the range.
 * - sources / funnel: about the leads created in the range (their current status).
 * - follow-ups completed: completed in the range; site visits: scheduled in the range.
 * - team rows count work assigned to each member.
 */
export interface ReportSummary {
  readonly range: { readonly from: string; readonly to: string };
  readonly scope: 'agency' | 'mine';
  readonly totals: {
    readonly newLeads: number;
    readonly wonDeals: number;
    readonly lostDeals: number;
    /** Percentage with one decimal; null when nothing closed in the range. */
    readonly winRate: number | null;
    readonly followUpsCompleted: number;
    readonly siteVisitsScheduled: number;
    readonly siteVisitsCompleted: number;
  };
  readonly sources: readonly ReportSourceRow[];
  readonly funnel: readonly { readonly status: LeadStatus; readonly count: number }[];
  readonly team: readonly ReportTeamRow[];
  readonly topProperties: readonly ReportPropertyRow[];
}

export interface ReportSourceRow {
  readonly source: LeadSource;
  readonly leads: number;
  /** Of those leads, how many are WON now. */
  readonly won: number;
  /** won ÷ leads × 100, one decimal. */
  readonly conversionRate: number;
}

export interface ReportTeamRow {
  /** null = work not assigned to anyone. */
  readonly userId: string | null;
  readonly name: string;
  readonly role: MemberRole | null;
  readonly newLeads: number;
  readonly followUpsCompleted: number;
  readonly siteVisitsCompleted: number;
  readonly wonDeals: number;
  readonly lostDeals: number;
}

export interface ReportPropertyRow {
  readonly id: string;
  readonly title: string;
  readonly location: string;
  readonly visits: number;
  readonly completed: number;
}

/** Percentage with one decimal; 0 when the denominator is 0. */
export function percent(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10;
}
