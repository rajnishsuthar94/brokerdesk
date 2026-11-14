import { Injectable, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import type {
  AvailabilityStatus,
  ListingType,
  Paginated,
  PropertyListQuery,
  PropertySortField,
  PropertyType,
  PropertyView,
} from '@brokerdesk/shared-types';
import { errorMessage } from '../../../shared/utils/http-error';
import { PropertiesApiService } from '../services/properties-api.service';

export interface PropertyFilters {
  readonly search: string;
  readonly listingType: ListingType | null;
  readonly propertyType: PropertyType | null;
  readonly availabilityStatus: AvailabilityStatus | null;
  readonly bhk: number | null;
  readonly minPrice: number | null;
  readonly maxPrice: number | null;
  readonly sort: PropertySortField;
  readonly order: 'asc' | 'desc';
}

export const DEFAULT_PROPERTY_FILTERS: PropertyFilters = {
  search: '',
  listingType: null,
  propertyType: null,
  availabilityStatus: null,
  bhk: null,
  minPrice: null,
  maxPrice: null,
  sort: 'createdAt',
  order: 'desc',
};

export const PROPERTIES_PAGE_SIZE = 12;

/** Property list state (filters, paging, results). Provided by the properties routes. */
@Injectable()
export class PropertiesListStore {
  private readonly api = inject(PropertiesApiService);
  private readonly filterState = signal<PropertyFilters>(DEFAULT_PROPERTY_FILTERS);
  readonly filters = this.filterState.asReadonly();
  readonly page = linkedSignal({ source: this.filterState, computation: () => 1 });

  readonly query = computed<PropertyListQuery>(() => {
    const f = this.filterState();
    return {
      search: f.search.trim() || undefined,
      listingType: f.listingType ?? undefined,
      propertyType: f.propertyType ? [f.propertyType] : undefined,
      availabilityStatus: f.availabilityStatus ? [f.availabilityStatus] : undefined,
      bhk: f.bhk ? [f.bhk] : undefined,
      minPrice: f.minPrice ?? undefined,
      maxPrice: f.maxPrice ?? undefined,
      sort: f.sort,
      order: f.order,
      page: this.page(),
      pageSize: PROPERTIES_PAGE_SIZE,
    };
  });

  private readonly resource = rxResource({ params: () => this.query(), stream: ({ params }) => this.api.list(params) });
  private readonly lastPage = linkedSignal<Paginated<PropertyView> | undefined, Paginated<PropertyView> | undefined>({
    source: () => this.resource.value(),
    computation: (value, previous) => value ?? previous?.value,
  });

  readonly items = computed(() => this.lastPage()?.items ?? []);
  readonly total = computed(() => this.lastPage()?.total ?? 0);
  readonly isLoading = this.resource.isLoading;
  readonly isFirstLoad = computed(() => this.resource.isLoading() && this.lastPage() === undefined);
  readonly error = computed(() => (this.resource.error() ? errorMessage(this.resource.error(), 'Could not load properties.') : null));
  readonly activeFilterCount = computed(() => {
    const f = this.filterState();
    return [f.listingType, f.propertyType, f.availabilityStatus, f.bhk, f.minPrice, f.maxPrice].filter((v) => v !== null).length;
  });
  readonly hasSearchOrFilters = computed(() => this.activeFilterCount() > 0 || this.filterState().search.trim() !== '');

  setSearch(search: string): void {
    if (search !== this.filterState().search) this.filterState.update((f) => ({ ...f, search }));
  }

  setFilters(patch: Partial<PropertyFilters>): void {
    this.filterState.update((f) => ({ ...f, ...patch }));
  }

  clearFilters(): void {
    this.filterState.update((f) => ({ ...DEFAULT_PROPERTY_FILTERS, sort: f.sort, order: f.order }));
  }

  setPage(page: number): void {
    const pages = Math.max(1, Math.ceil(this.total() / PROPERTIES_PAGE_SIZE));
    this.page.set(Math.min(Math.max(1, page), pages));
  }

  reload(): void {
    this.resource.reload();
  }
}
