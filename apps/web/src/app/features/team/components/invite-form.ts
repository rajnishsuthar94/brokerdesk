import { Component, computed, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MemberRole, assignableRoles } from '@brokerdesk/shared-types';
import { FieldError } from '../../../shared/components/field-error';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '../../../shared/utils/labels';

export interface InviteRequest {
  readonly email: string;
  readonly role: MemberRole;
}

/** Presentational: emits an invite request; the page performs it. */
@Component({
  selector: 'bd-invite-form',
  imports: [ReactiveFormsModule, FieldError],
  template: `
    <form class="space-y-4" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div>
        <label class="bd-label" for="invite-email">Email address</label>
        <input id="invite-email" class="bd-input" type="email" formControlName="email" inputmode="email" placeholder="colleague@example.com" />
        <bd-field-error [control]="form.controls.email" />
      </div>
      <fieldset>
        <legend class="bd-label">Role</legend>
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
          @for (role of roles(); track role) {
            <label class="flex cursor-pointer gap-2 rounded-lg border border-slate-300 p-3 text-sm has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
              <input type="radio" formControlName="role" [value]="role" class="mt-0.5 accent-brand-700" />
              <span>
                <span class="block font-medium">{{ labels[role] }}</span>
                <span class="block text-xs text-slate-500">{{ descriptions[role] }}</span>
              </span>
            </label>
          }
        </div>
      </fieldset>
      <button type="submit" class="bd-btn-primary w-full sm:w-auto" [disabled]="busy()">
        {{ busy() ? 'Creating invitation…' : 'Create invitation' }}
      </button>
    </form>
  `,
})
export class InviteForm {
  readonly myRole = input.required<MemberRole>();
  readonly busy = input(false);
  readonly invite = output<InviteRequest>();

  protected readonly labels = ROLE_LABELS;
  protected readonly descriptions = ROLE_DESCRIPTIONS;
  protected readonly roles = computed(() => assignableRoles(this.myRole()));
  protected readonly submitted = signal(false);

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(191)]],
    role: [MemberRole.AGENT as MemberRole, Validators.required],
  });

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;
    this.invite.emit(this.form.getRawValue());
  }

  /** Called by the parent after a successful invite. */
  reset(): void {
    this.form.reset({ email: '', role: MemberRole.AGENT });
  }
}
