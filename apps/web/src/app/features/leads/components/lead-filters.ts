import { Component, input, output } from '@angular/core';
import type {
  FollowUpFilter,
  LeadPriority,
  LeadSortField,
  LeadSource,
  LeadStatus,
  ListingType,
  PropertyType,
  TeamMember,
} from '@brokerdesk/shared-types';
import type { LeadFilters } from '../store/leads-list.store';
import {
  LISTING_LABELS,
  PRIORITY_LABELS,
  PROPERTY_TYPE_LABELS,
  SOURCE_LABELS,
  STATUS_LABELS,
  STATUS_ORDER,
  options,
} from '../models/lead-labels';

const SORTS: readonly { value: `${LeadSortField}:${'asc' | 'desc'}`; label: string }[] = [
  { value: 'createdAt:desc', label: 'Newest first' },
  { value: 'createdAt:asc', label: 'Oldest first' },
  { value: 'updatedAt:desc', label: 'Recently updated' },
  { value: 'nextFollowUpAt:asc', label: 'Next follow-up' },
  { value: 'priority:desc', label: 'Priority (high first)' },
  { value: 'budgetMax:desc', label: 'Budget (high first)' },
  { value: 'name:asc', label: 'Name (A–Z)' },
];

/** Presentational filter panel. Emits partial filter changes; the store owns the state. */
@Component({
  selector: 'bd-lead-filters',
  template: `
    <div class="space-y-3">
      <!-- Status chips: the most common filter, always visible and thumb-friendly -->
      <div class="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter by status">
        @for (s of statuses; track s) {
          <button type="button" class="shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium"
                  [class]="filters().status.includes(s) ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-300 bg-white text-slate-700'"
                  [attr.aria-pressed]="filters().status.includes(s)" (click)="toggleStatus.emit(s)">
            {{ statusLabels[s] }}
          </button>
        }
      </div>

      <div class="grid grid-cols-2 gap-2 lg:grid-cols-6">
        <label class="sr-only" for="f-followup">Follow-up</label>
        <select id="f-followup" class="bd-input" [value]="filters().followUp ?? ''" (change)="set('followUp', $event)">
          <option value="">Any follow-up</option>
          <option value="overdue">Overdue</option>
          <option value="today">Due today</option>
          <option value="upcoming">Upcoming</option>
          <option value="none">No follow-up set</option>
        </select>

        @if (canSeeAll()) {
          <label class="sr-only" for="f-assigned">Assigned to</label>
          <select id="f-assigned" class="bd-input" [value]="filters().assignedTo ?? ''" (change)="set('assignedTo', $event)">
            <option value="">Everyone</option>
            <option value="me">Assigned to me</option>
            <option value="unassigned">Unassigned</option>
            @for (m of members(); track m.userId) { <option [value]="m.userId">{{ m.name }}</option> }
          </select>
        }

        <label class="sr-only" for="f-listing">Buy or rent</label>
        <select id="f-listing" class="bd-input" [value]="filters().listingType ?? ''" (change)="set('listingType', $event)">
          <option value="">Buy & rent</option>
          @for (o of listingOptions; track o.value) { <option [value]="o.value">{{ o.label }}</option> }
        </select>

        <label class="sr-only" for="f-type">Property type</label>
        <select id="f-type" class="bd-input" [value]="filters().propertyType ?? ''" (change)="set('propertyType', $event)">
          <option value="">All property types</option>
          @for (o of propertyTypeOptions; track o.value) { <option [value]="o.value">{{ o.label }}</option> }
        </select>

        <label class="sr-only" for="f-source">Source</label>
        <select id="f-source" class="bd-input" [value]="filters().source[0] ?? ''" (change)="setList('source', $event)">
          <option value="">All sources</option>
          @for (o of sourceOptions; track o.value) { <option [value]="o.value">{{ o.label }}</option> }
        </select>

        <label class="sr-only" for="f-priority">Priority</label>
        <select id="f-priority" class="bd-input" [value]="filters().priority[0] ?? ''" (change)="setList('priority', $event)">
          <option value="">Any priority</option>
          @for (o of priorityOptions; track o.value) { <option [value]="o.value">{{ o.label }}</option> }
        </select>

        <label class="sr-only" for="f-sort">Sort by</label>
        <select id="f-sort" class="bd-input" [value]="filters().sort + ':' + filters().order" (change)="setSort($event)">
          @for (o of sorts; track o.value) { <option [value]="o.value">{{ o.label }}</option> }
        </select>
      </div>

      @if (activeCount() > 0) {
        <button type="button" class="bd-link text-sm" (click)="clear.emit()">Clear {{ activeCount() }} filter{{ activeCount() === 1 ? '' : 's' }}</button>
      }
    </div>
  `,
})
export class LeadFiltersPanel {
  readonly filters = input.required<LeadFilters>();
  readonly members = input<readonly TeamMember[]>([]);
  readonly canSeeAll = input(false);
  readonly activeCount = input(0);
  readonly changed = output<Partial<LeadFilters>>();
  readonly toggleStatus = output<LeadStatus>();
  readonly clear = output<void>();

  protected readonly statuses = STATUS_ORDER;
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly listingOptions = options(LISTING_LABELS);
  protected readonly propertyTypeOptions = options(PROPERTY_TYPE_LABELS);
  protected readonly sourceOptions = options(SOURCE_LABELS);
  protected readonly priorityOptions = options(PRIORITY_LABELS);
  protected readonly sorts = SORTS;

  private value(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  protected set(key: 'followUp' | 'assignedTo' | 'listingType' | 'propertyType', event: Event): void {
    const v = this.value(event) || null;
    const patch: Partial<LeadFilters> =
      key === 'followUp' ? { followUp: v as FollowUpFilter | null }
      : key === 'assignedTo' ? { assignedTo: v }
      : key === 'listingType' ? { listingType: v as ListingType | null }
      : { propertyType: v as PropertyType | null };
    this.changed.emit(patch);
  }

  protected setList(key: 'source' | 'priority', event: Event): void {
    const v = this.value(event);
    this.changed.emit(key === 'source' ? { source: v ? [v as LeadSource] : [] } : { priority: v ? [v as LeadPriority] : [] });
  }

  protected setSort(event: Event): void {
    const [sort, order] = this.value(event).split(':') as [LeadSortField, 'asc' | 'desc'];
    this.changed.emit({ sort, order });
  }
}
