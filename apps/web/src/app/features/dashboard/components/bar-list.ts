import { Component, computed, input } from '@angular/core';

export interface BarRow {
  readonly label: string;
  readonly value: number;
}

/**
 * Horizontal bars on one baseline, one hue (magnitude, not identity). Value at
 * the bar's tip, share in the accessible label. Used for part-to-whole splits
 * where parts must be compared (ranked) or read in a fixed order (pipeline).
 */
@Component({
  selector: 'bd-bar-list',
  template: `
    @if (total() === 0) {
      <p class="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-600">{{ emptyText() }}</p>
    } @else {
      <ul class="space-y-2.5" [attr.aria-label]="label()">
        @for (r of rows(); track r.label) {
          <li class="grid grid-cols-[minmax(0,7.5rem)_1fr] items-center gap-3 text-sm" [attr.aria-label]="r.label + ': ' + r.value + ' (' + share(r.value) + ')'"
              [title]="r.label + ': ' + r.value + ' (' + share(r.value) + ')'">
            <span class="truncate text-slate-700">{{ r.label }}</span>
            <span class="flex items-center gap-2" aria-hidden="true">
              @if (r.value > 0) {
                <span class="h-3 rounded-r-[4px]" [style.width.%]="(r.value / max()) * 85" [style.background]="color()"></span>
              }
              <span class="tabular-nums font-medium text-slate-900">{{ r.value }}</span>
            </span>
          </li>
        }
      </ul>
    }
  `,
})
export class BarList {
  readonly label = input.required<string>();
  readonly rows = input.required<readonly BarRow[]>();
  readonly color = input('#2a78d6');
  readonly emptyText = input('No data yet.');

  protected readonly total = computed(() => this.rows().reduce((n, r) => n + r.value, 0));
  protected readonly max = computed(() => Math.max(1, ...this.rows().map((r) => r.value)));

  protected share(value: number): string {
    const t = this.total();
    return t === 0 ? '0%' : `${Math.round((value / t) * 100)}%`;
  }
}
