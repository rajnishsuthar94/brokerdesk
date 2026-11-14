import { Injectable, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import type { LeadActivityView, LeadStatus, LeadView, UserLeadActivityType } from '@brokerdesk/shared-types';
import { firstValueFrom, of } from 'rxjs';
import { errorMessage } from '../../../shared/utils/http-error';
import { LeadsApiService } from '../services/leads-api.service';

/**
 * State of one lead and its activity history. Provided by the detail page.
 * Actions update local state from the server's response (no optimistic writes)
 * and throw on failure so the page can show a toast.
 */
@Injectable()
export class LeadDetailStore {
  private readonly api = inject(LeadsApiService);
  private readonly leadId = signal<string | null>(null);
  private readonly busyState = signal(false);

  private readonly leadResource = rxResource({
    params: () => this.leadId(),
    stream: ({ params: id }) => (id ? this.api.get(id) : of(undefined)),
  });

  private readonly activityResource = rxResource({
    params: () => this.leadId(),
    stream: ({ params: id }) => (id ? this.api.activities(id) : of([] as LeadActivityView[])),
  });

  readonly lead = computed(() => this.leadResource.value());
  readonly isLoading = this.leadResource.isLoading;
  readonly notFound = computed(() => {
    const e = this.leadResource.error() as { status?: number } | undefined;
    return e?.status === 404;
  });
  readonly error = computed(() =>
    this.leadResource.error() && !this.notFound() ? errorMessage(this.leadResource.error(), 'Could not load this lead.') : null,
  );
  readonly activities = computed(() => this.activityResource.value() ?? []);
  readonly activitiesLoading = this.activityResource.isLoading;
  readonly busy = this.busyState.asReadonly();

  load(id: string): void {
    this.leadId.set(id);
  }

  async changeStatus(status: LeadStatus, note?: string): Promise<void> {
    await this.run(async (id) => {
      this.leadResource.set(await firstValueFrom(this.api.changeStatus(id, status, note)));
      this.activityResource.reload();
    });
  }

  async assign(assignedUserId: string | null): Promise<void> {
    await this.run(async (id) => {
      this.leadResource.set(await firstValueFrom(this.api.assign(id, assignedUserId)));
      this.activityResource.reload();
    });
  }

  async addActivity(type: UserLeadActivityType, description: string): Promise<void> {
    await this.run(async (id) => {
      const activity = await firstValueFrom(this.api.addActivity(id, type, description));
      this.activityResource.update((list) => [activity, ...(list ?? [])]);
    });
  }

  async remove(): Promise<void> {
    await this.run(async (id) => {
      await firstValueFrom(this.api.remove(id));
    });
  }

  /** Re-fetch the lead and its history (after follow-ups / visits changed them). */
  refresh(): void {
    this.leadResource.reload();
    this.activityResource.reload();
  }

  /** After an edit on the form page, show the saved values without refetching. */
  setLead(lead: LeadView): void {
    this.leadResource.set(lead);
  }

  private async run(work: (id: string) => Promise<void>): Promise<void> {
    const id = this.leadId();
    if (!id || this.busyState()) return;
    this.busyState.set(true);
    try {
      await work(id);
    } finally {
      this.busyState.set(false);
    }
  }
}
