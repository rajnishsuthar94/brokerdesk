import { Component, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import type { AbstractControl } from '@angular/forms';
import { map, startWith, switchMap } from 'rxjs';

/** Default messages for built-in and app validators. Pass `messages` to override. */
const DEFAULTS: Readonly<Record<string, (args: Record<string, unknown>) => string>> = {
  required: () => 'This field is required',
  email: () => 'Enter a valid email address',
  minlength: (a) => `Must be at least ${String(a['requiredLength'])} characters`,
  maxlength: (a) => `Must be at most ${String(a['requiredLength'])} characters`,
  indianMobile: () => 'Enter a valid 10-digit mobile number',
  leadPhone: () => 'Enter a 10-digit mobile number, or an international number starting with +',
  password: () => 'Use at least 8 characters with a letter and a number',
  mismatch: () => 'Passwords do not match',
};

function firstError(c: AbstractControl, custom: Readonly<Record<string, string>>): string | null {
  if (!c.errors || !(c.touched || c.dirty)) return null;
  const [key, value] = Object.entries(c.errors)[0] ?? [];
  if (!key) return null;
  const override = custom[key];
  if (override) return override;
  const args = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return DEFAULTS[key]?.(args) ?? 'Please check this field';
}

/**
 * Shows the first validation error of a control once the user has touched it.
 * Usage: `<bd-field-error [control]="form.controls.email" />`
 *
 * Reactive via `control.events` (value, status and touched changes), so it
 * updates correctly under OnPush/zoneless change detection.
 */
@Component({
  selector: 'bd-field-error',
  template: `
    @if (message(); as msg) {
      <p class="bd-error" role="alert">{{ msg }}</p>
    }
  `,
})
export class FieldError {
  readonly control = input.required<AbstractControl>();
  readonly messages = input<Readonly<Record<string, string>>>({});

  protected readonly message = toSignal(
    toObservable(this.control).pipe(
      switchMap((c) =>
        c.events.pipe(
          startWith(null),
          map(() => firstError(c, this.messages())),
        ),
      ),
    ),
    { initialValue: null },
  );
}
