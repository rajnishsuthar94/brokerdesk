import { Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import type { DashboardSummary } from '@brokerdesk/shared-types';
import { AuthStore } from '../../../core/auth/auth.store';
import { ActivitiesApiService } from '../../../core/services/activities-api.service';
import { RemindersStore } from '../../../core/services/reminders.store';
import { SystemStatusStore, type ServiceState } from '../../../core/services/system-status.store';
import { IstDatePipe } from '../../../shared/pipes/format.pipes';
import { errorMessage } from '../../../shared/utils/http-error';
import { FollowUpItem } from '../../activities/components/follow-up-item';
import { SiteVisitItem } from '../../activities/components/site-visit-item';
import { SOURCE_LABELS, STATUS_LABELS, STATUS_ORDER } from '../../leads/models/lead-labels';
import { BarList, type BarRow } from '../components/bar-list';
import { monthLabels } from '../components/chart-scale';
import { ColumnChart, type ColumnSeries } from '../components/column-chart';

/** Chart colours (validated with the dataviz palette checks; see docs/architecture.md). */
const BLUE = '#2a78d6';
const BLUE_LIGHT = '#86b6ef';
const BLUE_DARK = '#1c5cab';
const CONTEXT_GRAY = '#a8a69c';

/**
 * Dashboard: KPIs, today's agenda, monthly trends and lead mix — all real
 * numbers from GET /api/v1/dashboard (agents see their own leads only).
 */
@Component({
  selector: 'bd-dashboard-page',
  imports: [RouterLink, IstDatePipe, FollowUpItem, SiteVisitItem, ColumnChart, BarList],
  template: `
    <section class="mx-auto max-w-6xl space-y-5">
      <header class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p class="mt-1 text-sm text-slate-600" data-testid="welcome">
            Welcome, {{ auth.user()?.name }}. You are working in <strong>{{ auth.activeMembership()?.agencyName }}</strong>.
            @if (data()?.scope === 'mine') { Showing the leads assigned to you. }
          </p>
        </div>
        <button type="button" class="bd-btn-secondary" (click)="reload()" [disabled]="summary.isLoading()">
          {{ summary.isLoading() ? 'Refreshing…' : 'Refresh' }}
        </button>
      </header>

      @if (summary.error() && !data()) {
        <p class="bd-alert-error" role="alert">{{ error() }}</p>
      } @else if (!data()) {
        <div class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-busy="true">
          @for (i of [1, 2, 3, 4, 5, 6]; track i) { <div class="h-24 animate-pulse rounded-2xl bg-slate-100"></div> }
        </div>
      } @else {
        @let d = data()!;
        <div class="space-y-5" [class.opacity-60]="summary.isLoading()">
          <!-- KPI row -->
          <dl class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" data-testid="kpis">
            <a routerLink="/leads" class="bd-card block p-4 hover:border-brand-500" data-testid="kpi-total-leads">
              <dt class="text-sm text-slate-600">Total leads</dt>
              <dd class="mt-1 text-2xl font-semibold">{{ d.totals.totalLeads }}</dd>
              <dd class="text-xs text-slate-500">{{ d.totals.newLeadsThisMonth }} new this month</dd>
            </a>
            <a routerLink="/follow-ups" [queryParams]="{ view: 'today' }" class="bd-card block p-4 hover:border-brand-500" data-testid="kpi-due-today">
              <dt class="text-sm text-slate-600">Follow-ups due today</dt>
              <dd class="mt-1 text-2xl font-semibold">{{ d.totals.followUpsDueToday }}</dd>
            </a>
            <a routerLink="/follow-ups" [queryParams]="{ view: 'overdue' }" class="bd-card block p-4 hover:border-brand-500" data-testid="kpi-overdue">
              <dt class="text-sm text-slate-600">Overdue follow-ups</dt>
              <dd class="mt-1 flex items-center gap-1.5 text-2xl font-semibold" [class.text-red-700]="d.totals.overdueFollowUps > 0">
                @if (d.totals.overdueFollowUps > 0) {
                  <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M12 8v5M12 16.5v.5M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/></svg>
                }
                {{ d.totals.overdueFollowUps }}
              </dd>
              <dd class="text-xs" [class]="d.totals.overdueFollowUps > 0 ? 'font-medium text-red-700' : 'text-slate-500'">
                {{ d.totals.overdueFollowUps > 0 ? 'Needs attention' : 'All caught up' }}
              </dd>
            </a>
            <a routerLink="/site-visits" class="bd-card block p-4 hover:border-brand-500" data-testid="kpi-visits">
              <dt class="text-sm text-slate-600">Site visits</dt>
              <dd class="mt-1 text-2xl font-semibold">{{ d.totals.upcomingSiteVisits }}</dd>
              <dd class="text-xs text-slate-500">in the next 7 days</dd>
            </a>
            <div class="bd-card p-4" data-testid="kpi-won">
              <dt class="text-sm text-slate-600">Deals won</dt>
              <dd class="mt-1 text-2xl font-semibold">{{ d.totals.wonDeals }}</dd>
              <dd class="text-xs text-slate-500">{{ d.totals.lostLeads }} lost</dd>
            </div>
            <div class="bd-card p-4" data-testid="kpi-conversion">
              <dt class="text-sm text-slate-600">Conversion</dt>
              <dd class="mt-1 text-2xl font-semibold">{{ d.totals.conversionRate }}%</dd>
              <dd class="text-xs text-slate-500">won ÷ all leads</dd>
            </div>
          </dl>

          <!-- Agenda -->
          <div class="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <article class="bd-card lg:col-span-3" aria-labelledby="agenda-title">
              <div class="mb-3 flex items-center justify-between gap-2">
                <h2 id="agenda-title" class="text-base font-semibold">To do today</h2>
                <a routerLink="/follow-ups" class="bd-link text-sm">All follow-ups</a>
              </div>
              @if (d.agenda.followUps.length === 0) {
                <p class="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-600" data-testid="agenda-empty">No follow-ups due today. 🎉</p>
              } @else {
                <ul class="divide-y divide-slate-100" aria-label="Follow-ups due">
                  @for (f of d.agenda.followUps; track f.id) {
                    <li class="py-3 first:pt-0 last:pb-0"><bd-follow-up-item [item]="f" (changed)="reload()" /></li>
                  }
                </ul>
              }
            </article>
            <article class="bd-card lg:col-span-2" aria-labelledby="visits-title">
              <div class="mb-3 flex items-center justify-between gap-2">
                <h2 id="visits-title" class="text-base font-semibold">Next site visits</h2>
                <a routerLink="/site-visits" class="bd-link text-sm">All visits</a>
              </div>
              @if (d.agenda.siteVisits.length === 0) {
                <p class="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-600">No visits scheduled.</p>
              } @else {
                <ul class="divide-y divide-slate-100" aria-label="Upcoming site visits">
                  @for (v of d.agenda.siteVisits; track v.id) {
                    <li class="py-3 first:pt-0 last:pb-0"><bd-site-visit-item [item]="v" (changed)="reload()" /></li>
                  }
                </ul>
              }
            </article>
          </div>

          <!-- Trends (last 6 months, IST) -->
          <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <article class="bd-card" aria-labelledby="enq-title">
              <h2 id="enq-title" class="text-base font-semibold">New enquiries</h2>
              <p class="mb-4 text-xs text-slate-500">Leads added per month</p>
              <bd-column-chart label="New enquiries per month" [categories]="months().short" [longLabels]="months().long" [series]="enquirySeries()" />
            </article>
            <article class="bd-card" aria-labelledby="sv-title">
              <h2 id="sv-title" class="text-base font-semibold">Site visits</h2>
              <p class="mb-4 text-xs text-slate-500">Scheduled vs completed, by visit month</p>
              <bd-column-chart label="Site visits per month" [categories]="months().short" [longLabels]="months().long" [series]="visitSeries()" />
            </article>
            <article class="bd-card" aria-labelledby="deals-title">
              <h2 id="deals-title" class="text-base font-semibold">Deals closed</h2>
              <p class="mb-4 text-xs text-slate-500">Won and lost, by month closed</p>
              <bd-column-chart label="Deals closed per month" [categories]="months().short" [longLabels]="months().long" [series]="dealSeries()" />
            </article>
          </div>

          <!-- Mix -->
          <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <article class="bd-card" aria-labelledby="src-title">
              <h2 id="src-title" class="mb-4 text-base font-semibold">Where leads come from</h2>
              <bd-bar-list label="Leads by source" [rows]="sourceRows()" emptyText="No leads yet." />
            </article>
            <article class="bd-card" aria-labelledby="pipe-title">
              <h2 id="pipe-title" class="mb-4 text-base font-semibold">Pipeline</h2>
              <bd-bar-list label="Leads by status" [rows]="statusRows()" emptyText="No leads yet." />
            </article>
          </div>
        </div>
      }

      <!-- System status (compact) -->
      <article class="rounded-2xl border border-slate-200 bg-white p-4" aria-labelledby="sys-status-title">
        <div class="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <h2 id="sys-status-title" class="font-semibold">System status</h2>
          @if (status.loadStatus() === 'idle' || (status.isLoading() && !status.checkedAt())) {
            <span class="text-slate-500" aria-busy="true">Checking…</span>
          } @else {
            <dl class="flex flex-wrap gap-x-6 gap-y-1">
              <div class="flex gap-1.5" data-testid="api-status"><dt class="text-slate-600">API server:</dt><dd class="font-semibold" [class]="toneFor(status.apiState())">{{ labelFor(status.apiState()) }}</dd></div>
              <div class="flex gap-1.5" data-testid="db-status"><dt class="text-slate-600">Database:</dt><dd class="font-semibold" [class]="toneFor(status.databaseState())">{{ labelFor(status.databaseState()) }}</dd></div>
            </dl>
            @if (status.checkedAt(); as checkedAt) { <span class="text-xs text-slate-500">Checked {{ checkedAt | istDate: 'datetime' }} IST</span> }
          }
          <button type="button" (click)="status.refresh()" [disabled]="status.isLoading()" class="bd-link ml-auto text-sm disabled:opacity-50">Check again</button>
        </div>
        @if (status.error(); as e) { <p class="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{{ e }}</p> }
      </article>
    </section>
  `,
})
export class DashboardPage {
  protected readonly auth = inject(AuthStore);
  protected readonly status = inject(SystemStatusStore);
  private readonly api = inject(ActivitiesApiService);
  private readonly reminders = inject(RemindersStore);

  protected readonly summary = rxResource({
    params: () => this.auth.activeAgencyId(),
    stream: () => this.api.dashboard(),
  });
  protected readonly data = computed<DashboardSummary | undefined>(() => (this.summary.hasValue() ? this.summary.value() : undefined));
  protected readonly error = computed(() => errorMessage(this.summary.error(), 'Could not load the dashboard.'));

  protected readonly months = computed(() => {
    const labels = (this.data()?.monthlyEnquiries ?? []).map((m) => monthLabels(m.month));
    return { short: labels.map((l) => l.short), long: labels.map((l) => l.long) };
  });
  protected readonly enquirySeries = computed<ColumnSeries[]>(() => [
    { name: 'New leads', color: BLUE, values: (this.data()?.monthlyEnquiries ?? []).map((m) => m.count) },
  ]);
  /** Nested measures (completed ⊂ scheduled): two shades of one hue. */
  protected readonly visitSeries = computed<ColumnSeries[]>(() => {
    const rows = this.data()?.monthlySiteVisits ?? [];
    return [
      { name: 'Scheduled', color: BLUE_LIGHT, values: rows.map((m) => m.count) },
      { name: 'Completed', color: BLUE_DARK, values: rows.map((m) => m.completed) },
    ];
  });
  /** Emphasis: won is the story, lost is context in gray. */
  protected readonly dealSeries = computed<ColumnSeries[]>(() => {
    const rows = this.data()?.monthlyDeals ?? [];
    return [
      { name: 'Won', color: BLUE, values: rows.map((m) => m.count) },
      { name: 'Lost', color: CONTEXT_GRAY, values: rows.map((m) => m.lost) },
    ];
  });
  /** Ranked, largest first. */
  protected readonly sourceRows = computed<BarRow[]>(() =>
    (this.data()?.leadsBySource ?? []).map((r) => ({ label: SOURCE_LABELS[r.source], value: r.count })).sort((a, b) => b.value - a.value),
  );
  /** Pipeline order (not ranked): stages read left-to-right as the sales flow. */
  protected readonly statusRows = computed<BarRow[]>(() => {
    const counts = new Map((this.data()?.leadsByStatus ?? []).map((r) => [r.status, r.count]));
    return STATUS_ORDER.map((s) => ({ label: STATUS_LABELS[s], value: counts.get(s) ?? 0 }));
  });

  protected reload(): void {
    this.summary.reload();
    void this.reminders.refresh();
  }

  protected labelFor(state: ServiceState): string {
    switch (state) {
      case 'up':
        return 'Working';
      case 'degraded':
        return 'Slow';
      case 'down':
        return 'Not reachable';
      default:
        return 'Unknown';
    }
  }

  protected toneFor(state: ServiceState): string {
    switch (state) {
      case 'up':
        return 'text-emerald-700';
      case 'degraded':
        return 'text-amber-700';
      case 'down':
        return 'text-red-700';
      default:
        return 'text-slate-500';
    }
  }
}
