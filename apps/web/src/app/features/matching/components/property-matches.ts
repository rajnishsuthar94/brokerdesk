import { Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import type { PropertyMatch } from '@brokerdesk/shared-types';
import { InrPipe } from '../../../shared/pipes/format.pipes';
import { AVAILABILITY_LABELS, PROPERTY_TYPE_LABELS } from '../../../shared/models/real-estate-labels';
import { errorMessage } from '../../../shared/utils/http-error';
import { propertyWhatsappUrl } from '../share-message';
import { MatchingApiService } from '../services/matching-api.service';
import { MatchCriteria } from './match-criteria';
import { ScoreBadge } from './score-badge';

export interface LeadContact {
  readonly id: string;
  readonly name: string;
  readonly phone: string;
}

/** Best-matching properties for one lead, with explanations and a WhatsApp share. */
@Component({
  selector: 'bd-property-matches',
  imports: [RouterLink, InrPipe, MatchCriteria, ScoreBadge],
  template: `
    @if (matches.isLoading() && !matches.value()) {
      <div class="space-y-2" aria-busy="true">
        @for (i of [1, 2]; track i) { <div class="h-24 animate-pulse rounded-xl bg-slate-100"></div> }
      </div>
    } @else if (matches.error()) {
      <p class="bd-alert-error" role="alert">{{ error() }}</p>
    } @else if (list().length === 0) {
      <p class="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-600" data-testid="no-matches">
        No available properties of this kind yet. Add properties to your inventory and they'll appear here.
      </p>
    } @else {
      <ul class="space-y-3" aria-label="Matching properties">
        @for (m of list(); track m.property.id) {
          <li class="flex gap-3 rounded-xl border border-slate-200 p-3" data-testid="property-match">
            @if (m.property.coverImageUrl) {
              <img [src]="m.property.coverImageUrl" alt="" class="h-20 w-24 shrink-0 rounded-lg object-cover" loading="lazy" />
            } @else {
              <div class="grid h-20 w-24 shrink-0 place-items-center rounded-lg bg-slate-100 text-xs text-slate-400" aria-hidden="true">No photo</div>
            }
            <div class="min-w-0 flex-1 space-y-1.5">
              <div class="flex items-start justify-between gap-2">
                <a [routerLink]="['/properties', m.property.id]" class="min-w-0 truncate font-semibold hover:text-brand-700">{{ m.property.title }}</a>
                <bd-score-badge [score]="m.score" />
              </div>
              <p class="text-sm text-slate-600">
                {{ m.property.price | inr: 'short' }} · {{ m.property.bhk ? m.property.bhk + ' BHK · ' : '' }}{{ typeLabels[m.property.propertyType] }} · {{ m.property.location }}
                @if (m.property.availabilityStatus !== 'AVAILABLE') { · <span class="font-medium text-amber-700">{{ availability[m.property.availabilityStatus] }}</span> }
              </p>
              <bd-match-criteria [criteria]="m.criteria" />
              @if (lead(); as l) {
                <div class="flex flex-wrap gap-x-4 gap-y-1">
                  <a class="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:underline" [href]="shareUrl(l, m)" target="_blank" rel="noopener">
                    Send to {{ l.name }} on WhatsApp
                  </a>
                  <a class="bd-link text-sm" routerLink="/site-visits/new" [queryParams]="{ lead: l.id, property: m.property.id }" data-testid="match-schedule-visit">Schedule visit</a>
                </div>
              }
            </div>
          </li>
        }
      </ul>
    }
  `,
})
export class PropertyMatches {
  readonly leadId = input.required<string>();
  /** When given, each match gets a "send on WhatsApp" link to this lead. */
  readonly lead = input<LeadContact | null>(null);

  private readonly api = inject(MatchingApiService);
  protected readonly typeLabels = PROPERTY_TYPE_LABELS;
  protected readonly availability = AVAILABILITY_LABELS;

  protected readonly matches = rxResource({
    params: () => this.leadId(),
    stream: ({ params: id }) => this.api.propertiesForLead(id),
  });
  protected readonly list = computed(() => this.matches.value() ?? []);
  protected readonly error = computed(() => errorMessage(this.matches.error(), 'Could not load matching properties.'));

  protected shareUrl(lead: LeadContact, m: PropertyMatch): string {
    return propertyWhatsappUrl(lead, m.property);
  }

  reload(): void {
    this.matches.reload();
  }
}
