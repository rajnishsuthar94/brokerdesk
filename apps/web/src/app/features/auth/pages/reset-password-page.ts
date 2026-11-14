import { Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthApiService } from '../../../core/auth/auth-api.service';
import { FieldError } from '../../../shared/components/field-error';
import { errorMessage } from '../../../shared/utils/http-error';
import { matchingPasswords, strongPassword } from '../../../shared/utils/validators';

@Component({
  selector: 'bd-reset-password-page',
  imports: [ReactiveFormsModule, RouterLink, FieldError],
  template: `
    <section class="bd-card sm:p-8">
      <h1 class="text-2xl font-semibold tracking-tight">Choose a new password</h1>

      @if (!token()) {
        <p class="bd-alert-error mt-4" role="alert">This reset link is incomplete. Please open the link from your email again.</p>
      } @else if (done()) {
        <p class="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
          Your password has been changed and you've been signed out of all devices.
        </p>
        <a routerLink="/login" class="bd-btn-primary mt-6 w-full">Log in with your new password</a>
      } @else {
        <form class="mt-6 space-y-4" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <div>
            <label class="bd-label" for="password">New password</label>
            <input id="password" class="bd-input" type="password" formControlName="password" autocomplete="new-password" />
            <p class="bd-hint">At least 8 characters, with a letter and a number.</p>
            <bd-field-error [control]="form.controls.password" />
          </div>
          <div>
            <label class="bd-label" for="confirmPassword">Confirm new password</label>
            <input id="confirmPassword" class="bd-input" type="password" formControlName="confirmPassword" autocomplete="new-password" />
            <bd-field-error [control]="form.controls.confirmPassword" />
          </div>
          @if (error(); as message) {
            <p class="bd-alert-error" role="alert">{{ message }}</p>
          }
          <button type="submit" class="bd-btn-primary w-full" [disabled]="submitting()">
            {{ submitting() ? 'Saving…' : 'Set new password' }}
          </button>
        </form>
      }
      <p class="mt-6 text-center text-sm"><a routerLink="/login" class="bd-link">Back to log in</a></p>
    </section>
  `,
})
export class ResetPasswordPage {
  private readonly api = inject(AuthApiService);

  /** From the `token` query parameter of the emailed link. */
  readonly token = input<string>();

  protected readonly submitting = signal(false);
  protected readonly done = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group(
    {
      password: ['', [Validators.required, strongPassword]],
      confirmPassword: ['', Validators.required],
    },
    { validators: matchingPasswords() },
  );

  protected async submit(): Promise<void> {
    const token = this.token();
    this.form.markAllAsTouched();
    if (!token || this.form.invalid || this.submitting()) return;
    this.submitting.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.api.resetPassword(token, this.form.controls.password.value));
      this.done.set(true);
    } catch (e: unknown) {
      this.error.set(errorMessage(e));
    } finally {
      this.submitting.set(false);
    }
  }
}
