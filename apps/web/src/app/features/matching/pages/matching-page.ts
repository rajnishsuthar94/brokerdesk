import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, map, of } from 'rxjs';
import { IndianPhonePipe, InrPipe } from '../../../shared/pipes/format.pipes';
import { LeadsApiService } from '../../leads/services/leads-api.service';
import { PropertyMatches } from '../components/property-matches';

/** Pick a buyer, see their best-matching properties with explanations. */
@Component({
  selector: 'bd-matching-page',
  imports: [RouterLink, PropertyMatches, InrPipe, IndianPhonePipe],
  template: `
    <section class="mx-auto max-w-4xl space-y-4">
      <header>
        <h1 class="text-2xl font-semibold tracking-tight">Matching</h1>
        <p class="text-sm text-slate-600">Choose a buyer to see which of your properties fit their requirement, and why.</p>
      </header>

      <div class="bd-card space-y-3">
        <label class="bd-label" for="match-search">Find a buyer</label>
        <input id="match-search" type="search" class="bd-input" placeholder="Name or phone" autocomplete="off"
               [value]="search()" (input)="search.set($any($event.target).value)" />
        @if (candidates.value(); as list) {
          @if (list.length > 0) {
            <ul class="divide-y divide-slate-100 rounded-lg border border-slate-200" aria-label="Buyers">
              @for (l of list; track l.id) {
                <li>
                  <button type="button" class="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-slate-50"
                          [class.bg-brand-50]="l.id === selectedId()" (click)="select(l.id)" data-testid="match-lead-option">
                    <span class="min-w-0">
                      <span class="block truncate font-medium">{{ l.name }}</span>
                      <span class="block truncate text-xs text-slate-500">
                        {{ l.phone | indianPhone }}@if (l.preferredLocation) { · {{ l.preferredLocation }} }@if (l.budgetMax) { · up to {{ l.budgetMax | inr: 'short' }} }
                      </span>
                    </span>
                    <span class="text-xs font-semibold text-brand-700">{{ l.id === selectedId() ? 'Selected' : 'Show matches' }}</span>
                  </button>
                </li>
              }
            </ul>
          } @else {
            <p class="text-sm text-slate-600">No open leads found. <a routerLink="/leads/new" class="bd-link">Add a lead</a></p>
          }
        }
      </div>

      @if (selected(); as lead) {
        <article class="bd-card" aria-labelledby="results-title">
          <h2 id="results-title" class="mb-3 text-base font-semibold">Best properties for <a [routerLink]="['/leads', lead.id]" class="bd-link">{{ lead.name }}</a></h2>
          <bd-property-matches [leadId]="lead.id" [lead]="lead" />
        </article>
      }
    </section>
  `,
})
export class MatchingPage {
  /** `?lead=<id>` preselects a buyer. */
  readonly lead = input<string>();
  private readonly leads = inject(LeadsApiService);
  private readonly router = inject(Router);

  protected readonly search = signal('');
  private readonly debounced = signal('');
  protected readonly chosenId = signal<string | null>(null);
  protected readonly selectedId = computed(() => this.chosenId() ?? this.lead() ?? null);

  protected readonly candidates = rxResource({
    params: () => this.debounced(),
    stream: ({ params: search }) =>
      this.leads
        .list({ search: search || undefined, status: ['NEW', 'CONTACTED', 'QUALIFIED', 'SITE_VISIT', 'NEGOTIATION'], sort: 'updatedAt', order: 'desc', pageSize: 8 })
        .pipe(map((page) => page.items)),
  });

  private readonly selectedLead = rxResource({
    params: () => this.selectedId(),
    stream: ({ params: id }) => (id ? this.leads.get(id) : of(undefined)),
  });
  protected readonly selected = computed(() => this.selectedLead.value() ?? null);

  constructor() {
    toObservable(this.search)
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((v) => this.debounced.set(v.trim()));
  }

  protected select(id: string): void {
    this.chosenId.set(id);
    void this.router.navigate([], { queryParams: { lead: id }, replaceUrl: true });
  }
}
