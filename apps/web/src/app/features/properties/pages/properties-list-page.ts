import { Component, inject, linkedSignal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import type { AvailabilityStatus, ListingType, PropertySortField, PropertyType } from '@brokerdesk/shared-types';
import { parseIndianAmount } from '@brokerdesk/shared-types';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { Pagination } from '../../../shared/components/pagination';
import {
  AVAILABILITY_LABELS,
  AVAILABILITY_STYLES,
  LISTING_LABELS_PROPERTY,
  PROPERTY_TYPE_LABELS,
  options,
} from '../../../shared/models/real-estate-labels';
import { InrPipe } from '../../../shared/pipes/format.pipes';
import { PROPERTIES_PAGE_SIZE, PropertiesListStore } from '../store/properties-list.store';

const SORTS: readonly { value: `${PropertySortField}:${'asc' | 'desc'}`; label: string }[] = [
  { value: 'createdAt:desc', label: 'Newest first' },
  { value: 'price:asc', label: 'Price: low to high' },
  { value: 'price:desc', label: 'Price: high to low' },
  { value: 'updatedAt:desc', label: 'Recently updated' },
  { value: 'title:asc', label: 'Title (A–Z)' },
];

@Component({
  selector: 'bd-properties-list-page',
  imports: [RouterLink, Pagination, InrPipe],
  templateUrl: './properties-list-page.html',
})
export class PropertiesListPage {
  protected readonly store = inject(PropertiesListStore);
  protected readonly pageSize = PROPERTIES_PAGE_SIZE;
  protected readonly typeOptions = options(PROPERTY_TYPE_LABELS);
  protected readonly listingOptions = options(LISTING_LABELS_PROPERTY);
  protected readonly availabilityOptions = options(AVAILABILITY_LABELS);
  protected readonly typeLabels = PROPERTY_TYPE_LABELS;
  protected readonly availabilityLabels = AVAILABILITY_LABELS;
  protected readonly availabilityStyles = AVAILABILITY_STYLES;
  protected readonly sorts = SORTS;
  protected readonly bhkOptions = [1, 2, 3, 4, 5];

  protected readonly searchText = linkedSignal(() => this.store.filters().search);

  constructor() {
    toObservable(this.searchText)
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((text) => this.store.setSearch(text));
  }

  private value(e: Event): string {
    return (e.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected onSearch(e: Event): void {
    this.searchText.set(this.value(e));
  }
  protected setListing(e: Event): void {
    this.store.setFilters({ listingType: (this.value(e) || null) as ListingType | null });
  }
  protected setType(e: Event): void {
    this.store.setFilters({ propertyType: (this.value(e) || null) as PropertyType | null });
  }
  protected setAvailability(e: Event): void {
    this.store.setFilters({ availabilityStatus: (this.value(e) || null) as AvailabilityStatus | null });
  }
  protected setBhk(e: Event): void {
    this.store.setFilters({ bhk: this.value(e) ? Number(this.value(e)) : null });
  }
  /** Accepts "85 L", "1.2 Cr"; invalid input clears the bound. */
  protected setPrice(bound: 'minPrice' | 'maxPrice', e: Event): void {
    const v = this.value(e).trim();
    this.store.setFilters({ [bound]: v ? parseIndianAmount(v) : null });
  }
  protected setSort(e: Event): void {
    const [sort, order] = this.value(e).split(':') as [PropertySortField, 'asc' | 'desc'];
    this.store.setFilters({ sort, order });
  }
  protected clearAll(): void {
    this.store.clearFilters();
    this.searchText.set('');
  }
}
