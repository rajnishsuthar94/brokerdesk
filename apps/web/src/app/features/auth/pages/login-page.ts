import { Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { safeReturnUrl } from '../../../core/auth/auth.guards';
import { AuthStore } from '../../../core/auth/auth.store';
import { FieldError } from '../../../shared/components/field-error';
import { errorMessage } from '../../../shared/utils/http-error';

@Component({
  selector: 'bd-login-page',
  imports: [ReactiveFormsModule, RouterLink, FieldError],
  template: `
    <section class="bd-card sm:p-8">
      <h1 class="text-2xl font-semibold tracking-tight">Log in</h1>
      <p class="mt-1 text-sm text-slate-600">Welcome back! Enter your details to continue.</p>

      <form class="mt-6 space-y-4" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div>
          <label class="bd-label" for="email">Email</label>
          <input id="email" class="bd-input" type="email" formControlName="email" autocomplete="email" inputmode="email" />
          <bd-field-error [control]="form.controls.email" />
        </div>
        <div>
          <div class="flex items-center justify-between">
            <label class="bd-label" for="password">Password</label>
            <a routerLink="/forgot-password" class="bd-link mb-1.5 text-sm">Forgot password?</a>
          </div>
          <input id="password" class="bd-input" type="password" formControlName="password" autocomplete="current-password" />
          <bd-field-error [control]="form.controls.password" />
        </div>

        @if (error(); as message) {
          <p class="bd-alert-error" role="alert">{{ message }}</p>
        }

        <button type="submit" class="bd-btn-primary w-full" [disabled]="submitting()">
          {{ submitting() ? 'Logging in…' : 'Log in' }}
        </button>
      </form>

      <p class="mt-6 text-center text-sm text-slate-600">
        New to BrokerDesk?
        <a [routerLink]="['/register']" [queryParams]="returnUrl() ? { returnUrl: returnUrl() } : {}" class="bd-link">Create an account</a>
      </p>
    </section>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  /** Bound from the `returnUrl` query parameter (withComponentInputBinding). */
  readonly returnUrl = input<string>();

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.submitting()) return;
    this.submitting.set(true);
    this.error.set(null);
    try {
      await this.auth.login(this.form.getRawValue());
      await this.router.navigateByUrl(safeReturnUrl(this.returnUrl()));
    } catch (e: unknown) {
      this.error.set(errorMessage(e));
    } finally {
      this.submitting.set(false);
    }
  }
}
