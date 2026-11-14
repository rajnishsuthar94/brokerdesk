import { Component, computed, inject, input, output, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import type { FollowUpView } from '@brokerdesk/shared-types';
import { firstValueFrom } from 'rxjs';
import { ActivitiesApiService } from '../../../core/services/activities-api.service';
import { RemindersStore } from '../../../core/services/reminders.store';
import { ToastService } from '../../../core/services/toast.service';
import { fromIstInputValue } from '../../../shared/utils/format';
import { errorMessage } from '../../../shared/utils/http-error';
import { FollowUpItem } from './follow-up-item';
import { TimeField } from './time-field';

/** Follow-ups of one lead (lead detail page): pending first, then recent history, plus "schedule". */
@Component({
  selector: 'bd-lead-follow-ups',
  imports: [FollowUpItem, TimeField],
  template: `
    <div class="mb-3 flex items-center justify-between gap-2">
      <h2 id="lead-followups-title" class="text-base font-semibold">Follow-ups</h2>
      @if (!adding()) {
        <button type="button" class="bd-btn-secondary min-h-10 px-3 text-sm" (click)="startAdding()" data-testid="schedule-follow-up">
          + Schedule follow-up
        </button>
      }
    </div>

    @if (adding()) {
      <form class="mb-4 space-y-3 rounded-xl border border-brand-100 bg-brand-50/40 p-3" (submit)="$event.preventDefault(); create()" aria-label="Schedule a follow-up">
        <bd-time-field inputId="new-follow-up-at" label="When (IST)" [(value)]="dueAt" [invalid]="submitted() && !dueAt()" />
        <div>
          <label class="bd-label" for="new-follow-up-notes">What to do (optional)</label>
          <input id="new-follow-up-notes" class="bd-input" maxlength="2000" placeholder="e.g. Share Applewoods brochure"
                 [value]="notes()" (input)="notes.set(valueOf($event))" />
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="submit" class="bd-btn-primary" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Save follow-up' }}</button>
          <button type="button" class="bd-btn-secondary" (click)="adding.set(false)">Cancel</button>
        </div>
      </form>
    }

    @if (list.isLoading() && !list.value()) {
      <div class="h-16 animate-pulse rounded-xl bg-slate-100" aria-busy="true"></div>
    } @else if (list.error()) {
      <p class="bd-alert-error" role="alert">Could not load follow-ups.</p>
    } @else if (pending().length === 0 && history().length === 0) {
      <p class="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">No follow-ups yet. Schedule one so you don't forget this buyer.</p>
    } @else {
      @if (pending().length === 0) {
        <p class="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Nothing scheduled — schedule the next follow-up.</p>
      }
      <ul class="divide-y divide-slate-100" aria-label="Follow-ups">
        @for (f of pending(); track f.id) {
          <li class="py-3 first:pt-0"><bd-follow-up-item [item]="f" [showLead]="false" [showAssignee]="true" (changed)="onChanged()" /></li>
        }
        @for (f of visibleHistory(); track f.id) {
          <li class="py-3 first:pt-0"><bd-follow-up-item [item]="f" [showLead]="false" /></li>
        }
      </ul>
      @if (history().length > visibleHistory().length) {
        <button type="button" class="bd-link mt-2 text-sm" (click)="showAll.set(true)">Show {{ history().length - visibleHistory().length }} older</button>
      }
    }
  `,
})
export class LeadFollowUps {
  readonly leadId = input.required<string>();
  /** The lead's next follow-up date and history changed — the page reloads them. */
  readonly changed = output<void>();

  private readonly api = inject(ActivitiesApiService);
  private readonly reminders = inject(RemindersStore);
  private readonly toasts = inject(ToastService);

  protected readonly list = rxResource({
    params: () => this.leadId(),
    stream: ({ params: id }) => this.api.followUpsForLead(id),
  });
  private readonly all = computed<readonly FollowUpView[]>(() => this.list.value() ?? []);
  protected readonly pending = computed(() =>
    this.all().filter((f) => f.status === 'PENDING').sort((a, b) => a.dueAt.localeCompare(b.dueAt)),
  );
  protected readonly history = computed(() => this.all().filter((f) => f.status !== 'PENDING'));
  protected readonly showAll = signal(false);
  protected readonly visibleHistory = computed(() => (this.showAll() ? this.history() : this.history().slice(0, 3)));

  protected readonly adding = signal(false);
  protected readonly busy = signal(false);
  protected readonly submitted = signal(false);
  protected readonly dueAt = signal('');
  protected readonly notes = signal('');

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected startAdding(): void {
    this.dueAt.set('');
    this.notes.set('');
    this.submitted.set(false);
    this.adding.set(true);
  }

  protected async create(): Promise<void> {
    this.submitted.set(true);
    const dueAt = fromIstInputValue(this.dueAt());
    if (!dueAt || this.busy()) return;
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.createFollowUp({ leadId: this.leadId(), dueAt, notes: this.notes().trim() || undefined }));
      this.toasts.success('Follow-up scheduled');
      this.adding.set(false);
      this.onChanged();
    } catch (e: unknown) {
      this.toasts.error(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected onChanged(): void {
    this.list.reload();
    void this.reminders.refresh();
    this.changed.emit();
  }
}
