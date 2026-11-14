import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import type { FollowUpListView } from '@brokerdesk/shared-types';
import { RemindersStore } from '../../../core/services/reminders.store';
import { ActivitiesApiService } from '../../../core/services/activities-api.service';
import { Pagination } from '../../../shared/components/pagination';
import { errorMessage } from '../../../shared/utils/http-error';
import { FollowUpItem } from '../components/follow-up-item';

const TABS: readonly { view: FollowUpListView; label: string; empty: string }[] = [
  { view: 'today', label: 'Today', empty: 'Nothing else due today.' },
  { view: 'overdue', label: 'Overdue', empty: 'No overdue follow-ups. Well done!' },
  { view: 'upcoming', label: 'Upcoming', empty: 'Nothing scheduled after today.' },
  { view: 'completed', label: 'Done', empty: 'No completed follow-ups yet.' },
];
const PAGE_SIZE = 30;

/** Follow-ups by when they're due (IST). Tabs live in the URL (?view=) so they survive refresh/back. */
@Component({
  selector: 'bd-follow-ups-page',
  imports: [RouterLink, FollowUpItem, Pagination],
  template: `
    <section class="mx-auto max-w-4xl space-y-4">
      <header class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight">Follow-ups</h1>
          <p class="text-sm text-slate-600">Calls and messages to make. Schedule new ones from a lead's page.</p>
        </div>
        <a routerLink="/leads" class="bd-btn-secondary">Go to leads</a>
      </header>

      <nav class="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1" aria-label="Follow-up views">
        @for (t of tabs; track t.view) {
          <a [routerLink]="[]" [queryParams]="{ view: t.view }" class="flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-4 text-sm font-medium"
             [class]="t.view === activeView() ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'"
             [attr.aria-current]="t.view === activeView() ? 'page' : null">
            {{ t.label }}
            @if (badge(t.view); as n) {
              <span class="rounded-full px-1.5 text-xs font-semibold" [class]="t.view === 'overdue' ? 'bg-red-100 text-red-800' : 'bg-slate-200 text-slate-700'">{{ n }}</span>
            }
          </a>
        }
      </nav>

      <div class="bd-card">
        @if (list.error()) {
          <p class="bd-alert-error" role="alert">{{ error() }}</p>
        } @else if (list.isLoading() && !list.value()) {
          <div class="space-y-3" aria-busy="true">
            @for (i of [1, 2, 3]; track i) { <div class="h-16 animate-pulse rounded-xl bg-slate-100"></div> }
          </div>
        } @else if (items().length === 0) {
          <p class="py-8 text-center text-slate-600" data-testid="follow-ups-empty">{{ current().empty }}</p>
        } @else {
          <ul class="divide-y divide-slate-100" [class.opacity-60]="list.isLoading()" aria-label="Follow-ups">
            @for (f of items(); track f.id) {
              <li class="py-4 first:pt-0 last:pb-0"><bd-follow-up-item [item]="f" [showAssignee]="true" (changed)="list.reload()" /></li>
            }
          </ul>
          <bd-pagination class="mt-4 block" [page]="page()" [pageSize]="pageSize" [total]="list.value()?.total ?? 0" (pageChange)="page.set($event)" />
        }
      </div>
    </section>
  `,
})
export class FollowUpsPage {
  /** ?view= (withComponentInputBinding). */
  readonly view = input<string | undefined>(undefined);

  private readonly api = inject(ActivitiesApiService);
  private readonly reminders = inject(RemindersStore);
  protected readonly tabs = TABS;
  protected readonly pageSize = PAGE_SIZE;

  protected readonly activeView = computed<FollowUpListView>(() => TABS.find((t) => t.view === this.view())?.view ?? 'today');
  protected readonly current = computed(() => TABS.find((t) => t.view === this.activeView()) ?? TABS[0]!);
  /** Back to page 1 whenever the tab changes. */
  protected readonly page = linkedSignal({ source: this.activeView, computation: () => 1 });

  protected readonly list = rxResource({
    params: () => ({ view: this.activeView(), page: this.page() }),
    stream: ({ params }) => this.api.followUps(params.view, params.page, PAGE_SIZE),
  });
  protected readonly items = computed(() => this.list.value()?.items ?? []);
  protected readonly error = computed(() => errorMessage(this.list.error(), 'Could not load follow-ups.'));

  /** Personal counts from the bell (the lists may also include teammates' items for managers). */
  protected badge(view: FollowUpListView): number {
    const c = this.reminders.counts();
    if (!c) return 0;
    return view === 'overdue' ? c.overdueFollowUps : view === 'today' ? c.followUpsDueToday : 0;
  }
}
