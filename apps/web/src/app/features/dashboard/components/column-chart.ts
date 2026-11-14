import { Component, computed, input, signal } from '@angular/core';
import { formatTick, niceScale } from './chart-scale';

export interface ColumnSeries {
  readonly name: string;
  /** Mark colour only — text never wears the series colour. */
  readonly color: string;
  readonly values: readonly number[];
}

/**
 * Small column chart (months on x, counts on one y axis).
 * Mark specs: ≤24px columns, 4px rounded data-end, square at the baseline, 2px
 * gap between touching columns, hairline solid gridlines. A legend appears for
 * 2+ series; the latest value of a single series is labelled on its cap.
 * Every value is reachable without hover: tooltip on hover/focus + a table view.
 */
@Component({
  selector: 'bd-column-chart',
  styles: `
    :host { display: block; --grid: #e2e8f0; --baseline: #cbd5e1; }
  `,
  template: `
    @if (series().length > 1) {
      <ul class="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600" aria-label="Legend">
        @for (s of series(); track s.name) {
          <li class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-sm" [style.background]="s.color" aria-hidden="true"></span>{{ s.name }}</li>
        }
      </ul>
    }
    <div class="flex gap-2" role="group" [attr.aria-label]="label()">
      <!-- y axis -->
      <div class="relative h-40 w-7 shrink-0 text-right text-[11px] tabular-nums text-slate-500" aria-hidden="true">
        @for (t of scale().ticks; track t) {
          <span class="absolute right-0 translate-y-1/2 leading-none" [style.bottom.%]="(t / scale().max) * 100">{{ tick(t) }}</span>
        }
      </div>
      <div class="min-w-0 flex-1">
        <div class="relative h-40">
          @for (t of scale().ticks; track t) {
            <div class="absolute inset-x-0 h-px" [style.bottom.%]="(t / scale().max) * 100"
                 [style.background]="t === 0 ? 'var(--baseline)' : 'var(--grid)'" aria-hidden="true"></div>
          }
          <div class="absolute inset-0 flex">
            @for (c of categories(); track $index; let i = $index) {
              <div class="relative flex flex-1 cursor-default items-end justify-center rounded-t outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                   [class.bg-slate-50]="active() === i" tabindex="0" [attr.aria-label]="describe(i)"
                   (mouseenter)="active.set(i)" (mouseleave)="active.set(null)" (focus)="active.set(i)" (blur)="active.set(null)">
                <div class="flex h-full items-end gap-[2px]">
                  @for (s of series(); track s.name) {
                    <div class="relative rounded-t-[4px]" [class]="series().length > 1 ? 'w-2.5 sm:w-4' : 'w-5 sm:w-6'"
                         [style.height.%]="(s.values[i] ?? 0) / scale().max * 100" [style.background]="s.color">
                      @if (series().length === 1 && i === categories().length - 1 && (s.values[i] ?? 0) > 0) {
                        <span class="absolute -top-5 left-1/2 -translate-x-1/2 text-xs font-semibold text-slate-900">{{ s.values[i] }}</span>
                      }
                    </div>
                  }
                </div>
                @if (active() === i) {
                  <div class="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 w-max -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg" role="tooltip">
                    <p class="mb-1 text-slate-500">{{ longLabels()[i] ?? categories()[i] }}</p>
                    @for (s of series(); track s.name) {
                      <p class="flex items-center gap-2">
                        <span class="h-0.5 w-3 rounded" [style.background]="s.color" aria-hidden="true"></span>
                        <strong class="tabular-nums text-slate-900">{{ s.values[i] ?? 0 }}</strong>
                        <span class="text-slate-600">{{ s.name }}</span>
                      </p>
                    }
                  </div>
                }
              </div>
            }
          </div>
        </div>
        <div class="mt-1.5 flex text-[11px] text-slate-500" aria-hidden="true">
          @for (c of categories(); track $index) { <span class="flex-1 text-center">{{ c }}</span> }
        </div>
      </div>
    </div>
    <details class="mt-3 text-sm">
      <summary class="cursor-pointer text-xs font-medium text-slate-500 hover:text-slate-700">Show as table</summary>
      <div class="mt-2 overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead><tr class="text-slate-500"><th class="py-1 pr-3 font-medium" scope="col">Month</th>
            @for (s of series(); track s.name) { <th class="py-1 pr-3 text-right font-medium" scope="col">{{ s.name }}</th> }
          </tr></thead>
          <tbody>
            @for (c of categories(); track $index; let i = $index) {
              <tr class="border-t border-slate-100"><th class="py-1 pr-3 font-normal" scope="row">{{ longLabels()[i] ?? c }}</th>
                @for (s of series(); track s.name) { <td class="py-1 pr-3 text-right tabular-nums">{{ s.values[i] ?? 0 }}</td> }
              </tr>
            }
          </tbody>
        </table>
      </div>
    </details>
  `,
})
export class ColumnChart {
  readonly label = input.required<string>();
  readonly categories = input.required<readonly string[]>();
  /** Fuller names for tooltips and the table (e.g. "November 2026"). */
  readonly longLabels = input<readonly string[]>([]);
  readonly series = input.required<readonly ColumnSeries[]>();

  protected readonly active = signal<number | null>(null);
  protected readonly scale = computed(() => niceScale(Math.max(0, ...this.series().flatMap((s) => s.values))));

  protected tick(v: number): string {
    return formatTick(v);
  }

  protected describe(i: number): string {
    const name = this.longLabels()[i] ?? this.categories()[i] ?? '';
    return `${name}: ${this.series().map((s) => `${s.values[i] ?? 0} ${s.name}`).join(', ')}`;
  }
}
