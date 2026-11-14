import { Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import type { PropertyView } from '@brokerdesk/shared-types';
import { IndianPhonePipe, InrPipe } from '../../../shared/pipes/format.pipes';
import { errorMessage } from '../../../shared/utils/http-error';
import { propertyWhatsappUrl } from '../share-message';
import { MatchingApiService } from '../services/matching-api.service';
import { MatchCriteria } from './match-criteria';
import { ScoreBadge } from './score-badge';

/** Buyers who match one property (only leads the user may see). */
@Component({
  selector: 'bd-lead-matches',
  imports: [RouterLink, InrPipe, IndianPhonePipe, MatchCriteria, ScoreBadge],
  template: `
    @if (matches.isLoading() && !matches.value()) {
      <div class="h-24 animate-pulse rounded-xl bg-slate-100" aria-busy="true"></div>
    } @else if (matches.error()) {
      <p class="bd-alert-error" role="alert">{{ error() }}</p>
    } @else if (list().length === 0) {
      <p class="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-600" data-testid="no-matches">No open leads match this property yet.</p>
    } @else {
      <ul class="space-y-3" aria-label="Matching buyers">
        @for (m of list(); track m.lead.id) {
          <li class="space-y-1.5 rounded-xl border border-slate-200 p-3" data-testid="lead-match">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <a [routerLink]="['/leads', m.lead.id]" class="min-w-0 truncate font-semibold hover:text-brand-700">{{ m.lead.name }}</a>
                <p class="text-sm text-slate-600">
                  {{ m.lead.phone | indianPhone }}
                  @if (m.lead.budgetMax) { · up to {{ m.lead.budgetMax | inr: 'short' }} }
                  @if (m.lead.preferredLocation) { · {{ m.lead.preferredLocation }} }
                </p>
              </div>
              <bd-score-badge [score]="m.score" />
            </div>
            <bd-match-criteria [criteria]="m.criteria" />
            <div class="flex flex-wrap gap-x-4 gap-y-1">
              <a class="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:underline" [href]="shareUrl(m.lead)" target="_blank" rel="noopener">
                Send this property on WhatsApp
              </a>
              <a class="bd-link text-sm" routerLink="/site-visits/new" [queryParams]="{ lead: m.lead.id, property: property().id }">Schedule visit</a>
            </div>
          </li>
        }
      </ul>
    }
  `,
})
export class LeadMatches {
  readonly property = input.required<PropertyView>();
  private readonly api = inject(MatchingApiService);

  protected readonly matches = rxResource({
    params: () => this.property().id,
    stream: ({ params: id }) => this.api.leadsForProperty(id),
  });
  protected readonly list = computed(() => this.matches.value() ?? []);
  protected readonly error = computed(() => errorMessage(this.matches.error(), 'Could not load matching buyers.'));

  protected shareUrl(lead: { name: string; phone: string }): string {
    return propertyWhatsappUrl(lead, this.property());
  }
}
