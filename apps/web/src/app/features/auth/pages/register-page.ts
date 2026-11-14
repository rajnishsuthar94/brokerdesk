import { Component, computed, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { safeReturnUrl } from '../../../core/auth/auth.guards';
import { AuthStore } from '../../../core/auth/auth.store';
import { FieldError } from '../../../shared/components/field-error';
import { errorMessage } from '../../../shared/utils/http-error';
import { indianMobile, strongPassword } from '../../../shared/utils/validators';

@Component({
  selector: 'bd-register-page',
  imports: [ReactiveFormsModule, RouterLink, FieldError],
  template: `
    <section class="bd-card sm:p-8">
      <h1 class="text-2xl font-semibold tracking-tight">Create your account</h1>
      <p class="mt-1 text-sm text-slate-600">
        @if (joiningByInvite()) {
          Create an account to accept your invitation.
        } @else {
          Start managing your leads and properties in minutes. Free to start.
        }
      </p>

      <form class="mt-6 space-y-4" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div>
          <label class="bd-label" for="name">Your name</label>
          <input id="name" class="bd-input" formControlName="name" autocomplete="name" />
          <bd-field-error [control]="form.controls.name" />
        </div>
        @if (!joiningByInvite()) {
          <div>
            <label class="bd-label" for="agencyName">Agency / business name</label>
            <input id="agencyName" class="bd-input" formControlName="agencyName" autocomplete="organization" placeholder="e.g. Sabarmati Realty" />
            <bd-field-error [control]="form.controls.agencyName" />
          </div>
        }
        <div>
          <label class="bd-label" for="email">Email</label>
          <input id="email" class="bd-input" type="email" formControlName="email" autocomplete="email" inputmode="email" />
          <bd-field-error [control]="form.controls.email" />
        </div>
        <div>
          <label class="bd-label" for="phone">Mobile number <span class="font-normal text-slate-500">(optional)</span></label>
          <input id="phone" class="bd-input" type="tel" formControlName="phone" autocomplete="tel" inputmode="tel" placeholder="98765 43210" />
          <bd-field-error [control]="form.controls.phone" />
        </div>
        <div>
          <label class="bd-label" for="password">Password</label>
          <input id="password" class="bd-input" type="password" formControlName="password" autocomplete="new-password" />
          <p class="bd-hint">At least 8 characters, with a letter and a number.</p>
          <bd-field-error [control]="form.controls.password" />
        </div>

        @if (error(); as message) {
          <p class="bd-alert-error" role="alert">{{ message }}</p>
        }

        <button type="submit" class="bd-btn-primary w-full" [disabled]="submitting()">
          {{ submitting() ? 'Creating account…' : 'Create account' }}
        </button>
      </form>

      <p class="mt-6 text-center text-sm text-slate-600">
        Already have an account?
        <a [routerLink]="['/login']" [queryParams]="returnUrl() ? { returnUrl: returnUrl() } : {}" class="bd-link">Log in</a>
      </p>
    </section>
  `,
})
export class RegisterPage {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  readonly returnUrl = input<string>();
  /** Coming from an invitation link: no agency is created. */
  protected readonly joiningByInvite = computed(() => (this.returnUrl() ?? '').startsWith('/invite'));

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(150)]],
    agencyName: ['', [Validators.minLength(2), Validators.maxLength(150)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(191)]],
    phone: ['', indianMobile],
    password: ['', [Validators.required, strongPassword]],
  });

  protected async submit(): Promise<void> {
    const agencyName = this.form.controls.agencyName;
    if (!this.joiningByInvite() && !agencyName.value.trim()) {
      agencyName.setErrors({ required: true });
    }
    this.form.markAllAsTouched();
    if (this.form.invalid || this.submitting()) return;

    this.submitting.set(true);
    this.error.set(null);
    const v = this.form.getRawValue();
    try {
      await this.auth.register({
        name: v.name,
        email: v.email,
        password: v.password,
        phone: v.phone.trim() || undefined,
        agencyName: this.joiningByInvite() ? undefined : v.agencyName,
      });
      await this.router.navigateByUrl(safeReturnUrl(this.returnUrl()));
    } catch (e: unknown) {
      this.error.set(errorMessage(e));
    } finally {
      this.submitting.set(false);
    }
  }
}
