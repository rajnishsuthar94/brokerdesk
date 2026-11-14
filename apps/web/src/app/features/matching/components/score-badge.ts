import { Component, computed, input } from '@angular/core';

/** Match score as a coloured pill: ≥ 80 strong, ≥ 50 partial, else weak. */
@Component({
  selector: 'bd-score-badge',
  template: `<span class="inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-bold" [class]="cls()" [attr.aria-label]="'Match score ' + score() + ' percent'">{{ score() }}%</span>`,
})
export class ScoreBadge {
  readonly score = input.required<number>();
  protected readonly cls = computed(() =>
    this.score() >= 80 ? 'bg-emerald-600 text-white' : this.score() >= 50 ? 'bg-amber-500 text-white' : 'bg-slate-300 text-slate-800',
  );
}
