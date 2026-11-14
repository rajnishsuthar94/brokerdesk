import { Injectable, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import type {
  FollowUpFilter,
  LeadListQuery,
  LeadPriority,
  LeadSortField,
  LeadSource,
  LeadStatus,
  LeadView,
  ListingType,
  Paginated,
  PropertyType,
} from '@brokerdesk/shared-types';
import { errorMessage } from '../../../shared/utils/http-error';
import { LeadsApiService } from '../services/leads-api.service';

export interface LeadFilters {
  readonly search: string;
  readonly status: readonly LeadStatus[];
  readonly priority: readonly LeadPriority[];
  readonly source: readonly LeadSource[];
  readonly listingType: ListingType | null;
  readonly propertyType: PropertyType | null;
  readonly assignedTo: string | null;
  readonly followUp: FollowUpFilter | null;
  readonly sort: LeadSortField;
  readonly order: 'asc' | 'desc';
}

export const DEFAULT_LEAD_FILTERS: LeadFilters = {
  search: '',
  status: [],
  priority: [],
  source: [],
  listingType: null,
  propertyType: null,
  assignedTo: null,
  followUp: null,
  sort: 'createdAt',
  order: 'desc',
};

export const LEADS_PAGE_SIZE = 20;

function toQuery(f: LeadFilters): LeadListQuery {
  return {
    search: f.search.trim() || undefined,
    status: f.status.length ? f.status : undefined,
    priority: f.priority.length ? f.priority : undefined,
    source: f.source.length ? f.source : undefined,
    listingType: f.listingType ?? undefined,
    propertyType: f.propertyType ?? undefined,
    assignedTo: f.assignedTo ?? undefined,
    followUp: f.followUp ?? undefined,
    sort: f.sort,
    order: f.order,
  };
}

/**
 * Lead list state: filters, paging and the current page of results.
 *
 * Provided by the leads routes (not root), so filters survive navigating to a
 * lead and back, but the state belongs to the Leads feature only.
 */
@Injectable()
export class LeadsListStore {
  private readonly api = inject(LeadsApiService);

  private readonly filterState = signal<LeadFilters>(DEFAULT_LEAD_FILTERS);
  readonly filters = this.filterState.asReadonly();

  /** Resets to page 1 whenever the filters change; otherwise set by the user. */
  readonly page = linkedSignal({ source: this.filterState, computation: () => 1 });

  /** Everything except paging and sort: used for export and "filters active" UI. */
  readonly query = computed<LeadListQuery>(() => ({
    ...toQuery(this.filterState()),
    page: this.page(),
    pageSize: LEADS_PAGE_SIZE,
  }));

  private readonly resource = rxResource({
    params: () => this.query(),
    stream: ({ params }) => this.api.list(params),
  });

  /** Keeps showing the previous page while the next one loads (no flicker). */
  private readonly lastPage = linkedSignal<Paginated<LeadView> | undefined, Paginated<LeadView> | undefined>({
    source: () => this.resource.value(),
    computation: (value, previous) => value ?? previous?.value,
  });

  readonly items = computed(() => this.lastPage()?.items ?? []);
  readonly total = computed(() => this.lastPage()?.total ?? 0);
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / LEADS_PAGE_SIZE)));
  readonly isLoading = this.resource.isLoading;
  readonly isFirstLoad = computed(() => this.resource.isLoading() && this.lastPage() === undefined);
  readonly error = computed(() => (this.resource.error() ? errorMessage(this.resource.error(), 'Could not load leads.') : null));

  readonly activeFilterCount = computed(() => {
    const f = this.filterState();
    return (
      f.status.length +
      f.priority.length +
      f.source.length +
      [f.listingType, f.propertyType, f.assignedTo, f.followUp].filter((v) => v !== null).length
    );
  });
  readonly hasSearchOrFilters = computed(() => this.activeFilterCount() > 0 || this.filterState().search.trim() !== '');

  setSearch(search: string): void {
    if (search === this.filterState().search) return;
    this.filterState.update((f) => ({ ...f, search }));
  }

  setFilters(patch: Partial<LeadFilters>): void {
    this.filterState.update((f) => ({ ...f, ...patch }));
  }

  toggleStatus(status: LeadStatus): void {
    this.filterState.update((f) => ({
      ...f,
      status: f.status.includes(status) ? f.status.filter((s) => s !== status) : [...f.status, status],
    }));
  }

  clearFilters(): void {
    this.filterState.update((f) => ({ ...DEFAULT_LEAD_FILTERS, sort: f.sort, order: f.order }));
  }

  setPage(page: number): void {
    this.page.set(Math.min(Math.max(1, page), this.totalPages()));
  }

  reload(): void {
    this.resource.reload();
  }
}
