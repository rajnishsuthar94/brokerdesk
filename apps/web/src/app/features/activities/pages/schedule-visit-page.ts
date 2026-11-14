import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom, map, type Observable } from 'rxjs';
import { ActivitiesApiService } from '../../../core/services/activities-api.service';
import { RemindersStore } from '../../../core/services/reminders.store';
import { ToastService } from '../../../core/services/toast.service';
import { formatIndianPhone, formatInr, fromIstInputValue } from '../../../shared/utils/format';
import { errorMessage } from '../../../shared/utils/http-error';
import { LeadsApiService } from '../../leads/services/leads-api.service';
import { PropertiesApiService } from '../../properties/services/properties-api.service';
import { type PickerOption, SearchPicker } from '../components/search-picker';
import { TimeField } from '../components/time-field';

/**
 * Schedule a site visit: buyer + property + time. Opened from a lead, a property,
 * a match ("Schedule visit") or the Site visits page; ?lead= / ?property= pre-fill.
 */
@Component({
  selector: 'bd-schedule-visit-page',
  imports: [RouterLink, SearchPicker, TimeField],
  template: `
    <section class="mx-auto max-w-2xl space-y-4">
      <a routerLink="/site-visits" class="bd-link text-sm">‹ Site visits</a>
      <h1 class="text-2xl font-semibold tracking-tight">Schedule a site visit</h1>
      <form class="bd-card space-y-5" (submit)="$event.preventDefault(); save()" aria-label="Schedule a site visit">
        <bd-search-picker label="Buyer" inputId="visit-lead" placeholder="Search by name or phone" emptyHint="Your recent leads appear here."
                          [search]="searchLeads" [(selected)]="selectedLead" [invalid]="submitted() && !selectedLead()" />
        <bd-search-picker label="Property" inputId="visit-property" placeholder="Search by title, location or society"
                          emptyHint="Your available properties appear here."
                          [search]="searchProperties" [(selected)]="selectedProperty" [invalid]="submitted() && !selectedProperty()" />
        <bd-time-field inputId="visit-at" label="Visit date & time (IST)" [(value)]="scheduledAt" [invalid]="submitted() && !scheduledAt()" />
        <div>
          <label class="bd-label" for="visit-notes">Notes (optional)</label>
          <input id="visit-notes" class="bd-input" maxlength="2000" placeholder="e.g. Meet at the society gate; owner has the keys"
                 [value]="notes()" (input)="notes.set(valueOf($event))" />
        </div>
        <p class="bd-hint">Scheduling moves a New, Contacted or Qualified lead to "Site Visit". It is recorded in the lead's history.</p>
        <div class="flex flex-wrap gap-2">
          <button type="submit" class="bd-btn-primary" [disabled]="busy()">{{ busy() ? 'Scheduling…' : 'Schedule visit' }}</button>
          <a [routerLink]="backLink()" class="bd-btn-secondary">Cancel</a>
        </div>
      </form>
    </section>
  `,
})
export class ScheduleVisitPage {
  /** Query parameters (withComponentInputBinding). */
  readonly lead = input<string | undefined>(undefined);
  readonly property = input<string | undefined>(undefined);

  private readonly api = inject(ActivitiesApiService);
  private readonly leadsApi = inject(LeadsApiService);
  private readonly propertiesApi = inject(PropertiesApiService);
  private readonly reminders = inject(RemindersStore);
  private readonly toasts = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly selectedLead = signal<PickerOption | null>(null);
  protected readonly selectedProperty = signal<PickerOption | null>(null);
  protected readonly scheduledAt = signal('');
  protected readonly notes = signal('');
  protected readonly busy = signal(false);
  protected readonly submitted = signal(false);

  protected readonly backLink = computed(() => {
    const l = this.lead();
    const p = this.property();
    return l ? ['/leads', l] : p ? ['/properties', p] : ['/site-visits'];
  });

  protected readonly searchLeads = (q: string): Observable<readonly PickerOption[]> =>
    this.leadsApi.list({ search: q || undefined, status: q ? undefined : ['NEW', 'CONTACTED', 'QUALIFIED', 'SITE_VISIT', 'NEGOTIATION'], pageSize: 8, sort: 'updatedAt', order: 'desc' }).pipe(
      map((page) => page.items.map((l) => ({ id: l.id, title: l.name, subtitle: formatIndianPhone(l.phone) }))),
    );

  protected readonly searchProperties = (q: string): Observable<readonly PickerOption[]> =>
    this.propertiesApi.list({ search: q || undefined, availabilityStatus: ['AVAILABLE'], pageSize: 8 }).pipe(
      map((page) => page.items.map((p) => ({ id: p.id, title: p.title, subtitle: `${formatInr(p.price, 'short')} · ${p.location}` }))),
    );

  constructor() {
    // Side effect: pre-fill the pickers from ?lead= / ?property=.
    effect(() => {
      const id = this.lead();
      if (id) untracked(() => void this.prefillLead(id));
    });
    effect(() => {
      const id = this.property();
      if (id) untracked(() => void this.prefillProperty(id));
    });
  }

  private async prefillLead(id: string): Promise<void> {
    try {
      const l = await firstValueFrom(this.leadsApi.get(id));
      this.selectedLead.set({ id: l.id, title: l.name, subtitle: formatIndianPhone(l.phone) });
    } catch {
      // Not visible / deleted: leave the picker empty.
    }
  }

  private async prefillProperty(id: string): Promise<void> {
    try {
      const p = await firstValueFrom(this.propertiesApi.get(id));
      this.selectedProperty.set({ id: p.id, title: p.title, subtitle: `${formatInr(p.price, 'short')} · ${p.location}` });
    } catch {
      // Not visible / deleted: leave the picker empty.
    }
  }

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected async save(): Promise<void> {
    this.submitted.set(true);
    const lead = this.selectedLead();
    const property = this.selectedProperty();
    const at = fromIstInputValue(this.scheduledAt());
    if (!lead || !property || !at || this.busy()) return;
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.createSiteVisit({ leadId: lead.id, propertyId: property.id, scheduledAt: at, notes: this.notes().trim() || undefined }));
      this.toasts.success(`Site visit scheduled for ${lead.title}`);
      void this.reminders.refresh();
      await this.router.navigate(this.lead() ? ['/leads', lead.id] : this.property() ? ['/properties', property.id] : ['/site-visits']);
    } catch (e: unknown) {
      this.toasts.error(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
