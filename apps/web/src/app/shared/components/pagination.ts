import { Component, computed, input, output } from '@angular/core';

/** Simple previous/next pager with "Showing x–y of N". */
@Component({
  selector: 'bd-pagination',
  template: `
    @if (total() > 0) {
      <nav class="flex items-center justify-between gap-3 text-sm" aria-label="Pagination">
        <p class="text-slate-600">
          Showing <strong>{{ from() }}–{{ to() }}</strong> of <strong>{{ total() }}</strong>
        </p>
        @if (totalPages() > 1) {
          <div class="flex items-center gap-2">
            <button type="button" class="bd-btn-secondary" [disabled]="page() <= 1" (click)="pageChange.emit(page() - 1)">
              <span aria-hidden="true">‹</span> Prev
            </button>
            <span class="hidden text-slate-600 sm:inline">Page {{ page() }} of {{ totalPages() }}</span>
            <button type="button" class="bd-btn-secondary" [disabled]="page() >= totalPages()" (click)="pageChange.emit(page() + 1)">
              Next <span aria-hidden="true">›</span>
            </button>
          </div>
        }
      </nav>
    }
  `,
})
export class Pagination {
  readonly page = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly total = input.required<number>();
  readonly pageChange = output<number>();

  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  protected readonly from = computed(() => (this.page() - 1) * this.pageSize() + 1);
  protected readonly to = computed(() => Math.min(this.total(), this.page() * this.pageSize()));
}
