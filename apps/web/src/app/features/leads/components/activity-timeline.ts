import { Component, inject, input, output } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { LEAD_ACTIVITY_TYPES_USER, type LeadActivityView, type UserLeadActivityType } from '@brokerdesk/shared-types';
import { IstDatePipe } from '../../../shared/pipes/format.pipes';
import { ACTIVITY_LABELS } from '../models/lead-labels';

export interface NewActivity {
  readonly type: UserLeadActivityType;
  readonly description: string;
}

const ICON_STYLES: Readonly<Record<string, string>> = {
  CALL: 'bg-sky-100 text-sky-700',
  WHATSAPP: 'bg-emerald-100 text-emerald-700',
  MEETING: 'bg-violet-100 text-violet-700',
  EMAIL: 'bg-indigo-100 text-indigo-700',
  STATUS_CHANGE: 'bg-amber-100 text-amber-700',
  ASSIGNMENT: 'bg-slate-200 text-slate-700',
};

/** Lead history plus a quick "log activity" form. Presentational. */
@Component({
  selector: 'bd-activity-timeline',
  imports: [ReactiveFormsModule, IstDatePipe],
  template: `
    <form class="space-y-3" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="flex flex-wrap gap-2" role="radiogroup" aria-label="Activity type">
        @for (t of types; track t) {
          <label class="cursor-pointer rounded-full border border-slate-300 px-3 py-1.5 text-sm has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-800">
            <input type="radio" class="sr-only" formControlName="type" [value]="t" />{{ labels[t] }}
          </label>
        }
      </div>
      <label class="sr-only" for="activity-text">What happened?</label>
      <textarea id="activity-text" class="bd-input min-h-20 py-2" rows="2" formControlName="description"
                placeholder="e.g. Called, wants to visit on Sunday"></textarea>
      <button type="submit" class="bd-btn-primary" [disabled]="busy() || form.invalid">Add to history</button>
    </form>

    <ol class="mt-6 space-y-4" aria-label="Activity history">
      @for (a of activities(); track a.id) {
        <li class="flex gap-3" data-testid="activity">
          <span class="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold"
                [class]="iconStyle(a.activityType)" aria-hidden="true">{{ labels[a.activityType].charAt(0) }}</span>
          <div class="min-w-0 flex-1">
            <p class="text-sm"><span class="font-semibold">{{ labels[a.activityType] }}</span> · {{ a.description }}</p>
            <p class="text-xs text-slate-500">{{ a.user?.name ?? 'System' }} · {{ a.createdAt | istDate: 'datetime' }}</p>
          </div>
        </li>
      } @empty {
        @if (!loading()) {
          <li class="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-500">No activity yet. Log your first call or note above.</li>
        }
      }
    </ol>
  `,
})
export class ActivityTimeline {
  readonly activities = input.required<readonly LeadActivityView[]>();
  readonly loading = input(false);
  readonly busy = input(false);
  readonly add = output<NewActivity>();

  protected readonly types = LEAD_ACTIVITY_TYPES_USER;
  protected readonly labels = ACTIVITY_LABELS;
  protected readonly form = inject(NonNullableFormBuilder).group({
    type: ['CALL' as UserLeadActivityType],
    description: ['', [Validators.required, Validators.maxLength(2000)]],
  });

  protected iconStyle(type: string): string {
    return ICON_STYLES[type] ?? 'bg-slate-100 text-slate-600';
  }

  protected submit(): void {
    const { type, description } = this.form.getRawValue();
    if (!description.trim() || this.busy()) return;
    this.add.emit({ type, description: description.trim() });
  }

  /** Called by the parent after the activity was saved. */
  reset(): void {
    this.form.controls.description.reset('');
  }
}
