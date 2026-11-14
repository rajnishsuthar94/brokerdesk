import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { canImportExportLeads, canSeeAllLeads } from '@brokerdesk/shared-types';
import { debounceTime, distinctUntilChanged, firstValueFrom } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth.store';
import { TeamDirectoryStore } from '../../../core/services/team-directory.store';
import { ToastService } from '../../../core/services/toast.service';
import { Pagination } from '../../../shared/components/pagination';
import { IndianPhonePipe, InrPipe, IstDatePipe } from '../../../shared/pipes/format.pipes';
import { filenameFromDisposition, saveBlob } from '../../../shared/utils/download';
import { errorMessage } from '../../../shared/utils/http-error';
import { LeadFiltersPanel } from '../components/lead-filters';
import { StatusBadge } from '../components/status-badge';
import { LISTING_LABELS, PRIORITY_LABELS, PRIORITY_STYLES } from '../models/lead-labels';
import { LeadsApiService } from '../services/leads-api.service';
import { LEADS_PAGE_SIZE, LeadsListStore } from '../store/leads-list.store';

@Component({
  selector: 'bd-leads-list-page',
  imports: [RouterLink, LeadFiltersPanel, StatusBadge, Pagination, InrPipe, IstDatePipe, IndianPhonePipe],
  templateUrl: './leads-list-page.html',
})
export class LeadsListPage {
  protected readonly store = inject(LeadsListStore);
  protected readonly team = inject(TeamDirectoryStore);
  private readonly auth = inject(AuthStore);
  private readonly api = inject(LeadsApiService);
  private readonly toasts = inject(ToastService);

  protected readonly pageSize = LEADS_PAGE_SIZE;
  protected readonly listingLabels = LISTING_LABELS;
  protected readonly priorityLabels = PRIORITY_LABELS;
  protected readonly priorityStyles = PRIORITY_STYLES;
  protected readonly canSeeAll = computed(() => {
    const role = this.auth.role();
    return role !== null && canSeeAllLeads(role);
  });
  protected readonly canImportExport = computed(() => {
    const role = this.auth.role();
    return role !== null && canImportExportLeads(role);
  });
  protected readonly showFilters = signal(false);
  protected readonly exporting = signal(false);
  protected readonly now = Date.now();

  /** What's typed in the box; starts from the store so it survives navigation. */
  protected readonly searchText = linkedSignal(() => this.store.filters().search);

  constructor() {
    toObservable(this.searchText)
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((text) => this.store.setSearch(text));
  }

  protected onSearchInput(event: Event): void {
    this.searchText.set((event.target as HTMLInputElement).value);
  }

  protected isOverdue(iso: string | null): boolean {
    return iso !== null && new Date(iso).getTime() < this.now;
  }

  protected async exportCsv(): Promise<void> {
    this.exporting.set(true);
    try {
      const res = await firstValueFrom(this.api.exportCsv(this.store.query()));
      if (res.body) saveBlob(res.body, filenameFromDisposition(res.headers.get('Content-Disposition'), 'brokerdesk-leads.csv'));
      this.toasts.success('Export downloaded');
    } catch (e: unknown) {
      this.toasts.error(errorMessage(e, 'Could not export leads.'));
    } finally {
      this.exporting.set(false);
    }
  }
}
