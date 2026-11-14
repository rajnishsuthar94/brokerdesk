import { Component, input } from '@angular/core';
import type { MatchCriterion, MatchCriterionKey, MatchStatus } from '@brokerdesk/shared-types';

const LABELS: Readonly<Record<MatchCriterionKey, string>> = {
  listingType: 'Buy/Rent',
  budget: 'Budget',
  location: 'Location',
  bhk: 'BHK',
  propertyType: 'Type',
  area: 'Area',
};

const STYLES: Readonly<Record<MatchStatus, { cls: string; icon: string; sr: string }>> = {
  match: { cls: 'bg-emerald-50 text-emerald-800 ring-emerald-200', icon: '✓', sr: 'matches' },
  near: { cls: 'bg-amber-50 text-amber-800 ring-amber-200', icon: '~', sr: 'close' },
  miss: { cls: 'bg-red-50 text-red-800 ring-red-200', icon: '✗', sr: 'does not match' },
  any: { cls: 'bg-slate-50 text-slate-500 ring-slate-200', icon: '·', sr: 'not specified' },
  unknown: { cls: 'bg-slate-50 text-slate-500 ring-slate-200', icon: '?', sr: 'not known' },
};

/** Explains a match: one line per criterion with ✓ / ~ / ✗ and the reason. */
@Component({
  selector: 'bd-match-criteria',
  template: `
    <ul class="flex flex-wrap gap-1.5" aria-label="Why this matches">
      @for (c of visible(); track c.key) {
        <li class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ring-1" [class]="styles[c.status].cls" [title]="c.detail">
          <span aria-hidden="true" class="font-bold">{{ styles[c.status].icon }}</span>
          <span>{{ labels[c.key] }}</span>
          <span class="sr-only">{{ styles[c.status].sr }}: {{ c.detail }}</span>
        </li>
      }
    </ul>
    @if (detailed()) {
      <ul class="mt-2 space-y-0.5 text-xs text-slate-600">
        @for (c of visible(); track c.key) {
          @if (c.status !== 'match') {
            <li><span aria-hidden="true">{{ styles[c.status].icon }}</span> {{ c.detail }}</li>
          }
        }
      </ul>
    }
  `,
})
export class MatchCriteria {
  readonly criteria = input.required<readonly MatchCriterion[]>();
  /** Also list the reasons for anything that isn't a full match. */
  readonly detailed = input(true);
  protected readonly labels = LABELS;
  protected readonly styles = STYLES;

  /** "any" criteria add noise in the chips; they're omitted. */
  protected visible(): readonly MatchCriterion[] {
    return this.criteria().filter((c) => c.status !== 'any');
  }
}
