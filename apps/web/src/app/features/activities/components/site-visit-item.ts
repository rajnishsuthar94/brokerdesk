import { Component, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { SiteVisitView } from '@brokerdesk/shared-types';
import { firstValueFrom, type Observable } from 'rxjs';
import { ActivitiesApiService } from '../../../core/services/activities-api.service';
import { RemindersStore } from '../../../core/services/reminders.store';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmDialogService } from '../../../shared/components/confirm-dialog';
import { IndianPhonePipe, IstDatePipe } from '../../../shared/pipes/format.pipes';
import { fromIstInputValue, toIstInputValue } from '../../../shared/utils/format';
import { errorMessage } from '../../../shared/utils/http-error';
import { relativeIstDateTime } from '../../../shared/utils/ist-time';
import { whatsappChatUrl } from '../../../shared/utils/whatsapp';
import { VISIT_STATUS_LABELS, VISIT_STATUS_STYLES, isOpenVisit } from '../activity-labels';
import { TimeField } from './time-field';

type Panel = 'none' | 'complete' | 'reschedule';

/** One site visit with its actions: record the visit (with feedback), reschedule, cancel. */
@Component({
  selector: 'bd-site-visit-item',
  imports: [RouterLink, TimeField, IndianPhonePipe, IstDatePipe],
  template: `
    @let v = item();
    <div class="flex gap-3" data-testid="site-visit-item">
      @if (showProperty()) {
        @if (v.property.coverImageUrl) {
          <img [src]="v.property.coverImageUrl" alt="" class="hidden h-16 w-20 shrink-0 rounded-lg object-cover sm:block" loading="lazy" />
        } @else {
          <div class="hidden h-16 w-20 shrink-0 place-items-center rounded-lg bg-slate-100 text-xs text-slate-400 sm:grid" aria-hidden="true">No photo</div>
        }
      }
      <div class="min-w-0 flex-1 space-y-2">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div class="min-w-0">
            @if (showProperty()) {
              <a [routerLink]="['/properties', v.property.id]" class="block truncate font-semibold hover:text-brand-700">{{ v.property.title }}</a>
              <p class="text-xs text-slate-500">{{ v.property.location }}</p>
            }
            @if (showLead()) {
              <p class="text-sm">
                <a [routerLink]="['/leads', v.lead.id]" class="font-medium hover:text-brand-700">{{ v.lead.name }}</a>
                <span class="text-slate-500"> {{ v.lead.phone | indianPhone }}</span>
              </p>
            }
            <p class="text-sm" [class.font-medium]="open()" [class.text-slate-500]="!open()">
              <time [attr.datetime]="v.scheduledAt" [title]="(v.scheduledAt | istDate: 'datetime') + ' IST'">{{ when() }}</time>
              @if (v.assignedUser) { <span class="text-slate-500"> · {{ v.assignedUser.name }}</span> }
            </p>
          </div>
          <span class="rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset" [class]="statusStyle()">{{ statusLabel() }}</span>
        </div>
        @if (v.feedback) {
          <p class="rounded-lg bg-slate-50 p-2 text-sm text-slate-700"><span class="font-medium">Feedback:</span> {{ v.feedback }}</p>
        }

        @if (open()) {
          @switch (panel()) {
            @case ('complete') {
              <form class="space-y-3 rounded-lg bg-slate-50 p-3" (submit)="$event.preventDefault(); complete()">
                <div>
                  <label class="bd-label" [for]="'feedback-' + v.id">Buyer's feedback (optional)</label>
                  <textarea [id]="'feedback-' + v.id" class="bd-input min-h-16 py-2" rows="2" maxlength="2000"
                            placeholder="e.g. Liked the layout, wants a better price"
                            [value]="feedback()" (input)="feedback.set(textOf($event))"></textarea>
                </div>
                <div class="flex flex-wrap gap-2">
                  <button type="submit" class="bd-btn-primary" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Save visit' }}</button>
                  <button type="button" class="bd-btn-secondary" (click)="panel.set('none')">Back</button>
                </div>
              </form>
            }
            @case ('reschedule') {
              <form class="space-y-3 rounded-lg bg-slate-50 p-3" (submit)="$event.preventDefault(); reschedule()">
                <bd-time-field [inputId]="'visit-resched-' + v.id" label="New date & time (IST)" [(value)]="newAt" [invalid]="submitted() && !newAt()" />
                <div class="flex flex-wrap gap-2">
                  <button type="submit" class="bd-btn-primary" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Reschedule' }}</button>
                  <button type="button" class="bd-btn-secondary" (click)="panel.set('none')">Back</button>
                </div>
              </form>
            }
            @default {
              <div class="flex flex-wrap gap-2">
                <button type="button" class="bd-btn-primary min-h-10 px-3 text-sm" (click)="openPanel('complete')">Visit done</button>
                <button type="button" class="bd-btn-secondary min-h-10 px-3 text-sm" (click)="openPanel('reschedule')">Reschedule</button>
                <a class="bd-btn-secondary min-h-10 px-3 text-sm text-emerald-800" [href]="reminderUrl()" target="_blank" rel="noopener"
                   [attr.aria-label]="'Send visit reminder to ' + v.lead.name + ' on WhatsApp'">WhatsApp reminder</a>
                <button type="button" class="min-h-10 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100" (click)="cancel()" [disabled]="busy()">
                  Cancel visit
                </button>
              </div>
            }
          }
        }
      </div>
    </div>
  `,
})
export class SiteVisitItem {
  readonly item = input.required<SiteVisitView>();
  readonly showLead = input(true);
  readonly showProperty = input(true);
  readonly changed = output<void>();

  private readonly api = inject(ActivitiesApiService);
  private readonly reminders = inject(RemindersStore);
  private readonly toasts = inject(ToastService);
  private readonly confirm = inject(ConfirmDialogService);

  protected readonly panel = signal<Panel>('none');
  protected readonly busy = signal(false);
  protected readonly submitted = signal(false);
  protected readonly feedback = signal('');
  protected readonly newAt = signal('');

  protected readonly open = computed(() => isOpenVisit(this.item().status));
  protected readonly statusLabel = computed(() => VISIT_STATUS_LABELS[this.item().status]);
  protected readonly statusStyle = computed(() => VISIT_STATUS_STYLES[this.item().status]);
  protected readonly when = computed(() => relativeIstDateTime(this.item().scheduledAt));
  /** Click-to-chat with a pre-filled reminder; the broker reviews and sends it themselves. */
  protected readonly reminderUrl = computed(() => {
    const v = this.item();
    const first = v.lead.name.split(' ')[0] ?? v.lead.name;
    return whatsappChatUrl(v.lead.phone, `Hi ${first}, reminder of your site visit to ${v.property.title}, ${v.property.location} — ${relativeIstDateTime(v.scheduledAt)}. See you there!`);
  });

  protected textOf(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }

  protected openPanel(panel: Panel): void {
    this.submitted.set(false);
    this.feedback.set('');
    this.newAt.set(toIstInputValue(this.item().scheduledAt));
    this.panel.set(panel);
  }

  protected async complete(): Promise<void> {
    await this.run(() => this.api.completeSiteVisit(this.item().id, this.feedback().trim() || undefined), 'Visit recorded');
  }

  protected async reschedule(): Promise<void> {
    this.submitted.set(true);
    const at = fromIstInputValue(this.newAt());
    if (!at) return;
    await this.run(() => this.api.rescheduleSiteVisit(this.item().id, at), 'Visit rescheduled');
  }

  protected async cancel(): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Cancel this site visit?',
      message: 'This is recorded in the lead history.',
      confirmText: 'Cancel visit',
      cancelText: 'Keep it',
      danger: true,
    });
    if (ok) await this.run(() => this.api.cancelSiteVisit(this.item().id), 'Visit cancelled');
  }

  private async run(call: () => Observable<SiteVisitView>, message: string): Promise<void> {
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
