import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import type { ReminderCounts } from '@brokerdesk/shared-types';
import { firstValueFrom } from 'rxjs';
import { ActivitiesApiService } from './activities-api.service';

/** How often the header bell re-checks while the app is open. */
export const REMINDER_POLL_MS = 5 * 60_000;

/**
 * In-app reminder counts for the header bell (the signed-in user's own overdue
 * and due-today follow-ups, and today's visits). This is polling while the app
 * is open — not push notifications, which need infrastructure we don't run.
 */
@Injectable({ providedIn: 'root' })
export class RemindersStore {
  private readonly api = inject(ActivitiesApiService);
  private readonly state = signal<ReminderCounts | null>(null);
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;

  readonly counts = this.state.asReadonly();
  /** Things needing action now: overdue + due today + today's visits. */
  readonly total = computed(() => {
    const c = this.state();
    return c ? c.overdueFollowUps + c.followUpsDueToday + c.siteVisitsToday : 0;
  });
  readonly hasOverdue = computed(() => (this.state()?.overdueFollowUps ?? 0) > 0);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  /** Start polling (idempotent). Called by the shell while an agency is active. */
  start(): void {
    void this.refresh();
    if (this.timer) return;
    this.timer = setInterval(() => void this.refresh(), REMINDER_POLL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.state.set(null);
  }

  /** Re-check now, e.g. after completing a follow-up. Failures keep the last counts. */
  async refresh(): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      this.state.set(await firstValueFrom(this.api.reminders()));
    } catch {
      // The bell is a convenience; never surface its errors.
    } finally {
      this.inFlight = false;
    }
  }
}
