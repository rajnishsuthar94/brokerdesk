import { Component, computed, input, model, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { type Observable, switchMap, timer } from 'rxjs';

export interface PickerOption {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
}

/**
 * Type-to-search single picker (leads, properties). Results come from the API
 * (already scoped to what the user may see); typing is debounced.
 */
@Component({
  selector: 'bd-search-picker',
  template: `
    <label class="bd-label" [for]="inputId()">{{ label() }}</label>
    @if (selected(); as s) {
      <div class="flex items-center justify-between gap-2 rounded-lg border border-brand-100 bg-brand-50/50 px-3 py-2" [attr.data-testid]="inputId() + '-selected'">
        <div class="min-w-0">
          <p class="truncate font-medium">{{ s.title }}</p>
          <p class="truncate text-sm text-slate-600">{{ s.subtitle }}</p>
        </div>
        <button type="button" class="bd-link shrink-0 text-sm" (click)="clear()" [attr.aria-label]="'Change ' + label()">Change</button>
      </div>
    } @else {
      <input [id]="inputId()" class="bd-input" type="search" autocomplete="off" [placeholder]="placeholder()"
             [value]="query()" (input)="query.set(valueOf($event))" [attr.aria-invalid]="invalid() || null"
             [attr.aria-controls]="inputId() + '-results'" />
      <ul [id]="inputId() + '-results'" class="mt-1 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white empty:hidden" role="listbox" [attr.aria-label]="label() + ' results'">
        @for (o of options(); track o.id) {
          <li role="option" aria-selected="false">
            <button type="button" class="block w-full px-3 py-2 text-left hover:bg-slate-50 focus:bg-slate-50" (click)="selected.set(o)">
              <span class="block truncate font-medium">{{ o.title }}</span>
              <span class="block truncate text-sm text-slate-600">{{ o.subtitle }}</span>
            </button>
          </li>
        }
      </ul>
      @if (results.isLoading()) {
        <p class="bd-hint">Searching…</p>
      } @else if (options().length === 0 && results.hasValue()) {
        <p class="bd-hint">{{ query().trim() ? 'No matches.' : emptyHint() }}</p>
      }
      @if (invalid()) { <p class="bd-error" role="alert">Choose {{ label().toLowerCase() }}.</p> }
    }
  `,
})
export class SearchPicker {
  readonly label = input.required<string>();
  readonly inputId = input.required<string>();
  readonly placeholder = input('Type to search');
  readonly emptyHint = input('Start typing to search.');
  readonly invalid = input(false);
  readonly search = input.required<(query: string) => Observable<readonly PickerOption[]>>();
  readonly selected = model<PickerOption | null>(null);

  protected readonly query = signal('');
  protected readonly results = rxResource({
    params: () => ({ q: this.query().trim(), search: this.search(), open: !this.selected() }),
    stream: ({ params }) => timer(params.q ? 250 : 0).pipe(switchMap(() => params.search(params.q))),
  });
  protected readonly options = computed(() => (this.results.hasValue() ? this.results.value() : []));

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected clear(): void {
    this.selected.set(null);
    this.query.set('');
  }
}
