import { Component, computed, inject, input, output } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ActivitiesApiService } from '../../../core/services/activities-api.service';
import { SiteVisitItem } from './site-visit-item';

/** Site visits of one lead or one property (detail pages), newest first, with a "schedule" link. */
@Component({
  selector: 'bd-related-site-visits',
  imports: [RouterLink, SiteVisitItem],
  template: `
    <div class="mb-3 flex items-center justify-between gap-2">
      <h2 class="text-base font-semibold">Site visits</h2>
      <a routerLink="/site-visits/new" [queryParams]="scheduleParams()" class="bd-btn-secondary min-h-10 px-3 text-sm" data-testid="schedule-visit-link">
        + Schedule visit
      </a>
    </div>
    @if (list.isLoading() && !list.value()) {
      <div class="h-16 animate-pulse rounded-xl bg-slate-100" aria-busy="true"></div>
    } @else if (list.error()) {
      <p class="bd-alert-error" role="alert">Could not load site visits.</p>
    } @else if (visits().length === 0) {
      <p class="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">No site visits yet.</p>
    } @else {
      <ul class="divide-y divide-slate-100" aria-label="Site visits">
        @for (v of visits(); track v.id) {
          <li class="py-3 first:pt-0">
            <bd-site-visit-item [item]="v" [showLead]="kind() === 'property'" [showProperty]="kind() === 'lead'" (changed)="onChanged()" />
          </li>
        }
      </ul>
    }
  `,
})
export class RelatedSiteVisits {
  readonly kind = input.required<'lead' | 'property'>();
  readonly id = input.required<string>();
  readonly changed = output<void>();

  private readonly api = inject(ActivitiesApiService);

  protected readonly list = rxResource({
    params: () => ({ kind: this.kind(), id: this.id() }),
    stream: ({ params }) => (params.kind === 'lead' ? this.api.siteVisitsForLead(params.id) : this.api.siteVisitsForProperty(params.id)),
  });
  protected readonly visits = computed(() => this.list.value() ?? []);
  protected readonly scheduleParams = computed(() => (this.kind() === 'lead' ? { lead: this.id() } : { property: this.id() }));

  protected onChanged(): void {
    this.list.reload();
    this.changed.emit();
  }
}
