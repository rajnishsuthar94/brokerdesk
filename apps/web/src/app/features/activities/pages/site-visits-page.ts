import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import type { SiteVisitListView } from '@brokerdesk/shared-types';
import { ActivitiesApiService } from '../../../core/services/activities-api.service';
import { Pagination } from '../../../shared/components/pagination';
import { errorMessage } from '../../../shared/utils/http-error';
import { SiteVisitItem } from '../components/site-visit-item';

const TABS: readonly { view: SiteVisitListView; label: string; empty: string }[] = [
  { view: 'upcoming', label: 'Upcoming', empty: 'No visits scheduled. Schedule one from a lead, a property or a match.' },
  { view: 'past', label: 'Past & cancelled', empty: 'No past visits yet.' },
];
const PAGE_SIZE = 30;

@Component({
  selector: 'bd-site-visits-page',
  imports: [RouterLink, SiteVisitItem, Pagination],
  template: `
    <section class="mx-auto max-w-4xl space-y-4">
      <header class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight">Site visits</h1>
          <p class="text-sm text-slate-600">Property visits with buyers, in IST.</p>
        </div>
        <a routerLink="/site-visits/new" class="bd-btn-primary" data-testid="new-visit">+ Schedule visit</a>
      </header>

      <nav class="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1" aria-label="Site visit views">
        @for (t of tabs; track t.view) {
          <a [routerLink]="[]" [queryParams]="{ view: t.view }" class="flex min-h-10 shrink-0 items-center rounded-lg px-4 text-sm font-medium"
             [class]="t.view === activeView() ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'"
             [attr.aria-current]="t.view === activeView() ? 'page' : null">{{ t.label }}</a>
        }
      </nav>

      <div class="bd-card">
        @if (list.error()) {
          <p class="bd-alert-error" role="alert">{{ error() }}</p>
        } @else if (list.isLoading() && !list.value()) {
          <div class="space-y-3" aria-busy="true">
            @for (i of [1, 2, 3]; track i) { <div class="h-20 animate-pulse rounded-xl bg-slate-100"></div> }
          </div>
        } @else if (items().length === 0) {
          <p class="py-8 text-center text-slate-600" data-testid="visits-empty">{{ current().empty }}</p>
        } @else {
          <ul class="divide-y divide-slate-100" [class.opacity-60]="list.isLoading()" aria-label="Site visits">
            @for (v of items(); track v.id) {
              <li class="py-4 first:pt-0 last:pb-0"><bd-site-visit-item [item]="v" (changed)="list.reload()" /></li>
            }
          </ul>
          <bd-pagination class="mt-4 block" [page]="page()" [pageSize]="pageSize" [total]="list.value()?.total ?? 0" (pageChange)="page.set($event)" />
        }
      </div>
    </section>
  `,
})
export class SiteVisitsPage {
  readonly view = input<string | undefined>(undefined);

  private readonly api = inject(ActivitiesApiService);
  protected readonly tabs = TABS;
  protected readonly pageSize = PAGE_SIZE;

  protected readonly activeView = computed<SiteVisitListView>(() => TABS.find((t) => t.view === this.view())?.view ?? 'upcoming');
  protected readonly current = computed(() => TABS.find((t) => t.view === this.activeView()) ?? TABS[0]!);
  protected readonly page = linkedSignal({ source: this.activeView, computation: () => 1 });

  protected readonly list = rxResource({
    params: () => ({ view: this.activeView(), page: this.page() }),
    stream: ({ params }) => this.api.siteVisits(params.view, params.page, PAGE_SIZE),
  });
  protected readonly items = computed(() => this.list.value()?.items ?? []);
  protected readonly error = computed(() => errorMessage(this.list.error(), 'Could not load site visits.'));
}
