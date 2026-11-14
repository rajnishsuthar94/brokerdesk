import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthApiService } from '../../../core/auth/auth-api.service';
import { FieldError } from '../../../shared/components/field-error';
import { errorMessage } from '../../../shared/utils/http-error';

@Component({
  selector: 'bd-forgot-password-page',
  imports: [ReactiveFormsModule, RouterLink, FieldError],
  template: `
    <section class="bd-card sm:p-8">
      <h1 class="text-2xl font-semibold tracking-tight">Forgot your password?</h1>
      @if (sent()) {
        <p class="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
          If an account exists for <strong>{{ form.controls.email.value }}</strong>, we've sent a link to reset your password.
          Check your inbox (and spam folder).
        </p>
      } @else {
        <p class="mt-1 text-sm text-slate-600">Enter your email and we'll send you a reset link.</p>
        <form class="mt-6 space-y-4" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <div>
            <label class="bd-label" for="email">Email</label>
            <input id="email" class="bd-input" type="email" formControlName="email" autocomplete="email" inputmode="email" />
            <bd-field-error [control]="form.controls.email" />
          </div>
          @if (error(); as message) {
            <p class="bd-alert-error" role="alert">{{ message }}</p>
          }
          <button type="submit" class="bd-btn-primary w-full" [disabled]="submitting()">
            {{ submitting() ? 'Sending…' : 'Send reset link' }}
          </button>
        </form>
      }
      <p class="mt-6 text-center text-sm"><a routerLink="/login" class="bd-link">Back to log in</a></p>
    </section>
  `,
})
export class ForgotPasswordPage {
  private readonly api = inject(AuthApiService);
  protected readonly submitting = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.submitting()) return;
    this.submitting.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.api.forgotPassword(this.form.controls.email.value));
      this.sent.set(true);
    } catch (e: unknown) {
      this.error.set(errorMessage(e));
    } finally {
      this.submitting.set(false);
    }
  }
}
