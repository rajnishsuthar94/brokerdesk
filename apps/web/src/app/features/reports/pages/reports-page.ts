import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import type { ReportExportSection, ReportSummary } from '@brokerdesk/shared-types';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth.store';
import { BusinessApiService } from '../../../core/services/business-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { filenameFromDisposition, saveBlob } from '../../../shared/utils/download';
import { errorMessage } from '../../../shared/utils/http-error';
import { ROLE_LABELS } from '../../../shared/utils/labels';
import { BarList, type BarRow } from '../../dashboard/components/bar-list';
import { SOURCE_LABELS, STATUS_LABELS, STATUS_ORDER } from '../../leads/models/lead-labels';
import { type RangePreset, PRESET_LABELS, displayDate, fyLabel, presetRange } from '../report-ranges';

const PRESETS = Object.keys(PRESET_LABELS) as RangePreset[];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Business reports for a date range (IST). The range lives in the URL
 * (?from=&to=) so a report can be bookmarked or shared with a colleague.
 */
@Component({
  selector: 'bd-reports-page',
  imports: [RouterLink, BarList],
  template: `
    <section class="mx-auto max-w-6xl space-y-5">
      <header class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight">Reports</h1>
          <p class="text-sm text-slate-600" data-testid="report-range">
            {{ label(range().from) }} – {{ label(range().to) }} · {{ fy() }}
            @if (data()?.scope === 'mine') { · your leads and work }
          </p>
        </div>
        @if (auth.canManageTeam()) {
          <div class="flex flex-wrap gap-2">
            <button type="button" class="bd-btn-secondary" (click)="download('team')" [disabled]="exporting()" data-testid="export-team">Download team CSV</button>
            <button type="button" class="bd-btn-secondary" (click)="download('sources')" [disabled]="exporting()">Download sources CSV</button>
          </div>
        }
      </header>

      <!-- One filter row, above everything it scopes. -->
      <div class="flex flex-wrap items-end gap-2" role="group" aria-label="Report period">
        @for (p of presets; track p) {
          <button type="button" class="min-h-10 rounded-full border px-4 text-sm font-medium"
                  [class]="activePreset() === p ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'"
                  [attr.aria-pressed]="activePreset() === p" (click)="choose(p)">{{ presetLabels[p] }}</button>
        }
        <form class="flex flex-wrap items-end gap-2" (submit)="$event.preventDefault(); applyCustom()" aria-label="Custom period">
          <div>
            <label class="bd-label text-xs" for="r-from">From</label>
            <input id="r-from" type="date" class="bd-input min-h-10" [value]="customFrom()" (input)="customFrom.set(valueOf($event))" />
          </div>
          <div>
            <label class="bd-label text-xs" for="r-to">To</label>
            <input id="r-to" type="date" class="bd-input min-h-10" [value]="customTo()" (input)="customTo.set(valueOf($event))" />
          </div>
          <button type="submit" class="bd-btn-secondary min-h-10">Apply</button>
        </form>
      </div>

      @if (report.error()) {
        <p class="bd-alert-error" role="alert">{{ error() }}</p>
      } @else if (!data()) {
        <div class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-busy="true">
          @for (i of [1, 2, 3, 4, 5, 6]; track i) { <div class="h-24 animate-pulse rounded-2xl bg-slate-100"></div> }
        </div>
      } @else {
        @let r = data()!;
        <div class="space-y-5" [class.opacity-60]="report.isLoading()">
          <dl class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" data-testid="report-totals">
            <div class="bd-card p-4"><dt class="text-sm text-slate-600">New leads</dt><dd class="mt-1 text-2xl font-semibold">{{ r.totals.newLeads }}</dd></div>
            <div class="bd-card p-4"><dt class="text-sm text-slate-600">Deals won</dt><dd class="mt-1 text-2xl font-semibold">{{ r.totals.wonDeals }}</dd></div>
            <div class="bd-card p-4"><dt class="text-sm text-slate-600">Deals lost</dt><dd class="mt-1 text-2xl font-semibold">{{ r.totals.lostDeals }}</dd></div>
            <div class="bd-card p-4">
              <dt class="text-sm text-slate-600">Win rate</dt>
              <dd class="mt-1 text-2xl font-semibold">{{ r.totals.winRate === null ? '—' : r.totals.winRate + '%' }}</dd>
              <dd class="text-xs text-slate-500">won ÷ closed in period</dd>
            </div>
            <div class="bd-card p-4"><dt class="text-sm text-slate-600">Follow-ups done</dt><dd class="mt-1 text-2xl font-semibold">{{ r.totals.followUpsCompleted }}</dd></div>
            <div class="bd-card p-4">
              <dt class="text-sm text-slate-600">Site visits done</dt>
              <dd class="mt-1 text-2xl font-semibold">{{ r.totals.siteVisitsCompleted }}</dd>
              <dd class="text-xs text-slate-500">of {{ r.totals.siteVisitsScheduled }} scheduled</dd>
            </div>
          </dl>

          <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <article class="bd-card" aria-labelledby="r-src-title">
              <h2 id="r-src-title" class="text-base font-semibold">Lead sources</h2>
              <p class="mb-3 text-xs text-slate-500">New leads in the period, and how many of them are won so far</p>
              @if (r.sources.length === 0) {
                <p class="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-600">No new leads in this period.</p>
              } @else {
                <div class="overflow-x-auto">
                  <table class="w-full text-sm" data-testid="sources-table">
                    <thead><tr class="text-left text-xs text-slate-500">
                      <th class="py-2 pr-3 font-medium" scope="col">Source</th>
                      <th class="py-2 pr-3 font-medium" scope="col">Leads</th>
                      <th class="py-2 pr-3 text-right font-medium" scope="col">Won</th>
                      <th class="py-2 text-right font-medium" scope="col">Conversion</th>
                    </tr></thead>
                    <tbody>
                      @for (s of r.sources; track s.source) {
                        <tr class="border-t border-slate-100">
                          <th class="py-2 pr-3 font-normal" scope="row">{{ sourceLabels[s.source] }}</th>
                          <td class="py-2 pr-3">
                            <span class="flex items-center gap-2">
                              <span class="h-2.5 rounded-r-[4px] bg-[#2a78d6]" [style.width.%]="(s.leads / maxSource()) * 70" aria-hidden="true"></span>
                              <span class="tabular-nums">{{ s.leads }}</span>
                            </span>
                          </td>
                          <td class="py-2 pr-3 text-right tabular-nums">{{ s.won }}</td>
                          <td class="py-2 text-right tabular-nums">{{ s.conversionRate }}%</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </article>
            <article class="bd-card" aria-labelledby="r-funnel-title">
              <h2 id="r-funnel-title" class="text-base font-semibold">Where those leads are now</h2>
              <p class="mb-3 text-xs text-slate-500">Current stage of the leads added in the period</p>
              <bd-bar-list label="Leads by stage" [rows]="funnelRows()" emptyText="No new leads in this period." />
            </article>
          </div>

          <article class="bd-card" aria-labelledby="r-team-title">
            <h2 id="r-team-title" class="text-base font-semibold">{{ r.scope === 'agency' ? 'Team performance' : 'Your performance' }}</h2>
            <p class="mb-3 text-xs text-slate-500">Work assigned to each person in the period</p>
            <div class="overflow-x-auto">
              <table class="w-full min-w-[36rem] text-sm" data-testid="team-table">
                <thead><tr class="text-left text-xs text-slate-500">
                  <th class="py-2 pr-3 font-medium" scope="col">Name</th>
                  <th class="py-2 pr-3 text-right font-medium" scope="col">New leads</th>
                  <th class="py-2 pr-3 text-right font-medium" scope="col">Follow-ups done</th>
                  <th class="py-2 pr-3 text-right font-medium" scope="col">Visits done</th>
                  <th class="py-2 pr-3 text-right font-medium" scope="col">Won</th>
                  <th class="py-2 text-right font-medium" scope="col">Lost</th>
                </tr></thead>
                <tbody>
                  @for (m of r.team; track m.userId ?? 'none') {
                    <tr class="border-t border-slate-100">
                      <th class="py-2 pr-3 font-normal" scope="row">
                        {{ m.name }} @if (m.role) { <span class="text-xs text-slate-500">· {{ roleLabels[m.role] }}</span> }
                      </th>
                      <td class="py-2 pr-3 text-right tabular-nums">{{ m.newLeads }}</td>
                      <td class="py-2 pr-3 text-right tabular-nums">{{ m.followUpsCompleted }}</td>
                      <td class="py-2 pr-3 text-right tabular-nums">{{ m.siteVisitsCompleted }}</td>
                      <td class="py-2 pr-3 text-right tabular-nums">{{ m.wonDeals }}</td>
                      <td class="py-2 text-right tabular-nums">{{ m.lostDeals }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </article>

          <article class="bd-card" aria-labelledby="r-props-title">
            <h2 id="r-props-title" class="text-base font-semibold">Most visited properties</h2>
            <p class="mb-3 text-xs text-slate-500">Site visits scheduled in the period (cancelled visits excluded)</p>
            @if (r.topProperties.length === 0) {
              <p class="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-600">No site visits in this period.</p>
            } @else {
              <ol class="divide-y divide-slate-100">
                @for (p of r.topProperties; track p.id) {
                  <li class="flex items-center justify-between gap-3 py-2 text-sm">
                    <a [routerLink]="['/properties', p.id]" class="min-w-0 truncate font-medium hover:text-brand-700">{{ p.title }} <span class="font-normal text-slate-500">· {{ p.location }}</span></a>
                    <span class="shrink-0 tabular-nums text-slate-700">{{ p.visits }} visit{{ p.visits === 1 ? '' : 's' }} · {{ p.completed }} done</span>
                  </li>
                }
              </ol>
            }
          </article>
        </div>
      }
    </section>
  `,
})
export class ReportsPage {
  /** ?from=&to= (withComponentInputBinding). */
  readonly from = input<string | undefined>(undefined);
  readonly to = input<string | undefined>(undefined);

  protected readonly auth = inject(AuthStore);
  private readonly api = inject(BusinessApiService);
  private readonly toasts = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly presets = PRESETS;
  protected readonly presetLabels = PRESET_LABELS;
  protected readonly sourceLabels = SOURCE_LABELS;
  protected readonly roleLabels = ROLE_LABELS;

  protected readonly range = computed(() => {
    const from = this.from();
    const to = this.to();
    return from && to && DATE.test(from) && DATE.test(to) ? { from, to } : presetRange('this-month');
  });
  protected readonly activePreset = computed(() => {
    const r = this.range();
    return PRESETS.find((p) => {
      const pr = presetRange(p);
      return pr.from === r.from && pr.to === r.to;
    });
  });
  protected readonly customFrom = signal(this.range().from);
  protected readonly customTo = signal(this.range().to);
  protected readonly fy = computed(() => fyLabel(this.range().from) === fyLabel(this.range().to) ? fyLabel(this.range().from) : `${fyLabel(this.range().from)} – ${fyLabel(this.range().to)}`);
  protected readonly exporting = signal(false);

  protected readonly report = rxResource({
    params: () => ({ ...this.range(), agency: this.auth.activeAgencyId() }),
    stream: ({ params }) => this.api.report(params.from, params.to),
  });
  protected readonly data = computed<ReportSummary | undefined>(() => (this.report.hasValue() ? this.report.value() : undefined));
  protected readonly error = computed(() => errorMessage(this.report.error(), 'Could not load the report.'));
  protected readonly maxSource = computed(() => Math.max(1, ...(this.data()?.sources ?? []).map((s) => s.leads)));
  protected readonly funnelRows = computed<BarRow[]>(() => {
    const counts = new Map((this.data()?.funnel ?? []).map((f) => [f.status, f.count]));
    return STATUS_ORDER.map((s) => ({ label: STATUS_LABELS[s], value: counts.get(s) ?? 0 }));
  });

  protected label(date: string): string {
    return displayDate(date);
  }

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected choose(preset: RangePreset): void {
    const r = presetRange(preset);
    this.customFrom.set(r.from);
    this.customTo.set(r.to);
    void this.router.navigate([], { queryParams: r, replaceUrl: true });
  }

  protected applyCustom(): void {
    const from = this.customFrom();
    const to = this.customTo();
    if (!DATE.test(from) || !DATE.test(to)) {
      this.toasts.error('Choose both dates.');
      return;
    }
    if (from > to) {
      this.toasts.error('"From" must be on or before "To".');
      return;
    }
    void this.router.navigate([], { queryParams: { from, to }, replaceUrl: true });
  }

  protected async download(section: ReportExportSection): Promise<void> {
    this.exporting.set(true);
    try {
      const { from, to } = this.range();
      const res = await firstValueFrom(this.api.exportReport(from, to, section));
      if (res.body) saveBlob(res.body, filenameFromDisposition(res.headers.get('Content-Disposition'), `brokerdesk-${section}.csv`));
      this.toasts.success('Report downloaded');
    } catch (e: unknown) {
      this.toasts.error(errorMessage(e, 'Could not download the report.'));
    } finally {
      this.exporting.set(false);
    }
  }
}
