import { Component, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { FollowUpView } from '@brokerdesk/shared-types';
import { firstValueFrom } from 'rxjs';
import { ActivitiesApiService } from '../../../core/services/activities-api.service';
import { RemindersStore } from '../../../core/services/reminders.store';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmDialogService } from '../../../shared/components/confirm-dialog';
import { IndianPhonePipe, IstDatePipe } from '../../../shared/pipes/format.pipes';
import { fromIstInputValue, toIstInputValue } from '../../../shared/utils/format';
import { errorMessage } from '../../../shared/utils/http-error';
import { relativeIstDateTime } from '../../../shared/utils/ist-time';
import { whatsappChatUrl } from '../../../shared/utils/whatsapp';
import { TIMING_LABELS, TIMING_STYLES, followUpTiming } from '../activity-labels';
import { TimeField } from './time-field';

type Panel = 'none' | 'complete' | 'reschedule';

/**
 * One follow-up with its actions: mark done (with outcome and an optional next
 * follow-up), reschedule, cancel. Emits `changed` after any successful action.
 */
@Component({
  selector: 'bd-follow-up-item',
  imports: [RouterLink, TimeField, IndianPhonePipe, IstDatePipe],
  template: `
    @let f = item();
    <div class="space-y-2" data-testid="follow-up-item">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="min-w-0">
          @if (showLead()) {
            <a [routerLink]="['/leads', f.lead.id]" class="font-semibold hover:text-brand-700">{{ f.lead.name }}</a>
            <span class="ml-1 text-sm text-slate-500">{{ f.lead.phone | indianPhone }}</span>
          }
          <p class="text-sm" [class.font-medium]="open()" [class.text-slate-500]="!open()">
            <time [attr.datetime]="f.dueAt" [title]="(f.dueAt | istDate: 'datetime') + ' IST'">{{ when() }}</time>
            @if (f.assignedUser && showAssignee()) { <span class="text-slate-500"> · {{ f.assignedUser.name }}</span> }
          </p>
        </div>
        <span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset" [class]="timingStyle()">
          @if (timing() === 'overdue') {
            <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M12 8v5M12 16.5v.5M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/></svg>
          }
          {{ timingLabel() }}
        </span>
      </div>
      @if (f.notes) { <p class="whitespace-pre-line text-sm text-slate-700">{{ f.notes }}</p> }

      @if (open()) {
        @switch (panel()) {
          @case ('complete') {
            <form class="space-y-3 rounded-lg bg-slate-50 p-3" (submit)="$event.preventDefault(); complete()">
              <div>
                <label class="bd-label" [for]="'outcome-' + f.id">What happened? (optional)</label>
                <textarea [id]="'outcome-' + f.id" class="bd-input min-h-16 py-2" rows="2" maxlength="2000"
                          placeholder="e.g. Spoke to him, wants to see 3BHKs in Shela on Sunday"
                          [value]="outcome()" (input)="outcome.set(textOf($event))"></textarea>
              </div>
              <label class="flex items-center gap-2 text-sm">
                <input type="checkbox" class="h-4 w-4" [checked]="scheduleNext()" (change)="scheduleNext.set(!scheduleNext())" />
                Schedule the next follow-up
              </label>
              @if (scheduleNext()) {
                <bd-time-field [inputId]="'next-' + f.id" label="Next follow-up (IST)" [(value)]="nextAt" [invalid]="submitted() && !nextAt()" />
              }
              <div class="flex flex-wrap gap-2">
                <button type="submit" class="bd-btn-primary" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Mark done' }}</button>
                <button type="button" class="bd-btn-secondary" (click)="close()">Back</button>
              </div>
            </form>
          }
          @case ('reschedule') {
            <form class="space-y-3 rounded-lg bg-slate-50 p-3" (submit)="$event.preventDefault(); reschedule()">
              <bd-time-field [inputId]="'resched-' + f.id" label="New date & time (IST)" [(value)]="nextAt" [invalid]="submitted() && !nextAt()" />
              <div class="flex flex-wrap gap-2">
                <button type="submit" class="bd-btn-primary" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Reschedule' }}</button>
                <button type="button" class="bd-btn-secondary" (click)="close()">Back</button>
              </div>
            </form>
          }
          @default {
            <div class="flex flex-wrap gap-2">
              <button type="button" class="bd-btn-primary min-h-10 px-3 text-sm" (click)="openPanel('complete')">Mark done</button>
              <button type="button" class="bd-btn-secondary min-h-10 px-3 text-sm" (click)="openPanel('reschedule')">Reschedule</button>
              @if (showLead()) {
                <a class="bd-btn-secondary min-h-10 px-3 text-sm" [href]="'tel:' + f.lead.phone" [attr.aria-label]="'Call ' + f.lead.name">Call</a>
                <a class="bd-btn-secondary min-h-10 px-3 text-sm text-emerald-800" [href]="whatsappUrl()" target="_blank" rel="noopener"
                   [attr.aria-label]="'WhatsApp ' + f.lead.name">WhatsApp</a>
              }
              <button type="button" class="min-h-10 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100" (click)="cancel()" [disabled]="busy()">
                Cancel follow-up
              </button>
            </div>
          }
        }
      }
    </div>
  `,
})
export class FollowUpItem {
  readonly item = input.required<FollowUpView>();
  readonly showLead = input(true);
  readonly showAssignee = input(false);
  readonly changed = output<void>();

  private readonly api = inject(ActivitiesApiService);
  private readonly reminders = inject(RemindersStore);
  private readonly toasts = inject(ToastService);
  private readonly confirm = inject(ConfirmDialogService);

  protected readonly panel = signal<Panel>('none');
  protected readonly busy = signal(false);
  protected readonly submitted = signal(false);
  protected readonly outcome = signal('');
  protected readonly scheduleNext = signal(false);
  protected readonly nextAt = signal('');

  protected readonly open = computed(() => this.item().status === 'PENDING');
  protected readonly timing = computed(() => followUpTiming(this.item()));
  protected readonly timingLabel = computed(() => TIMING_LABELS[this.timing()]);
  protected readonly timingStyle = computed(() => TIMING_STYLES[this.timing()]);
  protected readonly when = computed(() => {
    const f = this.item();
    if (f.status === 'COMPLETED' && f.completedAt) return `Done ${relativeIstDateTime(f.completedAt)}`;
    return relativeIstDateTime(f.dueAt);
  });
  protected readonly whatsappUrl = computed(() => whatsappChatUrl(this.item().lead.phone));

  protected textOf(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }

  protected openPanel(panel: Panel): void {
    this.submitted.set(false);
    this.outcome.set('');
    this.scheduleNext.set(false);
    this.nextAt.set(panel === 'reschedule' ? toIstInputValue(this.item().dueAt) : '');
    this.panel.set(panel);
  }

  protected close(): void {
    this.panel.set('none');
  }

  protected async complete(): Promise<void> {
    this.submitted.set(true);
    const next = this.scheduleNext() ? fromIstInputValue(this.nextAt()) : null;
    if (this.scheduleNext() && !next) return;
    await this.run(
      () => this.api.completeFollowUp(this.item().id, { outcome: this.outcome().trim() || undefined, nextDueAt: next ?? undefined }),
      next ? 'Done — next follow-up scheduled' : 'Follow-up marked done',
    );
  }

  protected async reschedule(): Promise<void> {
    this.submitted.set(true);
    const at = fromIstInputValue(this.nextAt());
    if (!at) return;
    await this.run(() => this.api.rescheduleFollowUp(this.item().id, at), 'Follow-up rescheduled');
  }

  protected async cancel(): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Cancel this follow-up?',
      message: 'It will be removed from your reminders. This is recorded in the lead history.',
      confirmText: 'Cancel follow-up',
      cancelText: 'Keep it',
      danger: true,
    });
    if (ok) await this.run(() => this.api.cancelFollowUp(this.item().id), 'Follow-up cancelled');
  }

  private async run(call: () => ReturnType<ActivitiesApiService['cancelFollowUp']>, message: string): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await firstValueFrom(call());
      this.toasts.success(message);
      this.panel.set('none');
      void this.reminders.refresh();
      this.changed.emit();
    } catch (e: unknown) {
      this.toasts.error(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
