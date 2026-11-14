import { Component, effect, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth.store';
import { AgencyApiService } from '../../../core/services/agency-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmDialogService } from '../../../shared/components/confirm-dialog';
import { FieldError } from '../../../shared/components/field-error';
import { formatIndianPhone } from '../../../shared/utils/format';
import { errorMessage } from '../../../shared/utils/http-error';
import { indianMobile, matchingPasswords, strongPassword } from '../../../shared/utils/validators';

@Component({
  selector: 'bd-settings-page',
  imports: [ReactiveFormsModule, FieldError, RouterLink],
  template: `
    <section class="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 class="text-2xl font-semibold tracking-tight">Settings</h1>
      </header>

      <!-- Profile -->
      <form class="bd-card space-y-4" [formGroup]="profile" (ngSubmit)="saveProfile()" novalidate aria-labelledby="profile-title">
        <h2 id="profile-title" class="text-base font-semibold">Your profile</h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label class="bd-label" for="p-name">Name</label>
            <input id="p-name" class="bd-input" formControlName="name" autocomplete="name" />
            <bd-field-error [control]="profile.controls.name" />
          </div>
          <div>
            <label class="bd-label" for="p-phone">Mobile number</label>
            <input id="p-phone" class="bd-input" type="tel" formControlName="phone" inputmode="tel" autocomplete="tel" />
            <bd-field-error [control]="profile.controls.phone" />
          </div>
        </div>
        <p class="text-sm text-slate-600">Email: <strong>{{ auth.user()?.email }}</strong></p>
        <button type="submit" class="bd-btn-primary" [disabled]="savingProfile() || profile.pristine">
          {{ savingProfile() ? 'Saving…' : 'Save profile' }}
        </button>
      </form>

      <!-- Password -->
      <form class="bd-card space-y-4" [formGroup]="password" (ngSubmit)="changePassword()" novalidate aria-labelledby="pw-title">
        <h2 id="pw-title" class="text-base font-semibold">Change password</h2>
        <div>
          <label class="bd-label" for="pw-current">Current password</label>
          <input id="pw-current" class="bd-input" type="password" formControlName="currentPassword" autocomplete="current-password" />
          <bd-field-error [control]="password.controls.currentPassword" />
        </div>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label class="bd-label" for="pw-new">New password</label>
            <input id="pw-new" class="bd-input" type="password" formControlName="password" autocomplete="new-password" />
            <bd-field-error [control]="password.controls.password" />
          </div>
          <div>
            <label class="bd-label" for="pw-confirm">Confirm new password</label>
            <input id="pw-confirm" class="bd-input" type="password" formControlName="confirmPassword" autocomplete="new-password" />
            <bd-field-error [control]="password.controls.confirmPassword" />
          </div>
        </div>
        <p class="bd-hint">Changing your password signs you out on all other devices.</p>
        <button type="submit" class="bd-btn-primary" [disabled]="savingPassword()">
          {{ savingPassword() ? 'Updating…' : 'Update password' }}
        </button>
      </form>

      @if (auth.hasAgency()) {
        <nav class="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Agency settings">
          <a routerLink="/plan" class="bd-card block p-4 hover:border-brand-500" data-testid="settings-plan-link">
            <p class="font-semibold">Plan & usage</p>
            <p class="text-sm text-slate-600">Your plan, lead and team limits, upgrades</p>
          </a>
          <a routerLink="/templates" class="bd-card block p-4 hover:border-brand-500">
            <p class="font-semibold">WhatsApp templates</p>
            <p class="text-sm text-slate-600">Ready-made messages for your team</p>
          </a>
        </nav>
      }

      <!-- Agency -->
      @if (auth.hasAgency()) {
        <form class="bd-card space-y-4" [formGroup]="agencyForm" (ngSubmit)="saveAgency()" novalidate aria-labelledby="agency-title">
          <h2 id="agency-title" class="text-base font-semibold">Agency details</h2>
          @if (agency.isLoading()) {
            <div class="h-24 animate-pulse rounded-lg bg-slate-100" aria-busy="true"></div>
          } @else if (agency.error()) {
            <p class="bd-alert-error" role="alert">Could not load agency details.</p>
          } @else {
            <fieldset class="grid grid-cols-1 gap-4 sm:grid-cols-2" [disabled]="!auth.canManageTeam()">
              <div class="sm:col-span-2">
                <label class="bd-label" for="a-name">Agency name</label>
                <input id="a-name" class="bd-input" formControlName="name" />
                <bd-field-error [control]="agencyForm.controls.name" />
              </div>
              <div>
                <label class="bd-label" for="a-phone">Office phone</label>
                <input id="a-phone" class="bd-input" type="tel" formControlName="phone" inputmode="tel" />
              </div>
              <div>
                <label class="bd-label" for="a-email">Office email</label>
                <input id="a-email" class="bd-input" type="email" formControlName="email" inputmode="email" />
                <bd-field-error [control]="agencyForm.controls.email" />
              </div>
              <div class="sm:col-span-2">
                <label class="bd-label" for="a-address">Address</label>
                <input id="a-address" class="bd-input" formControlName="address" autocomplete="street-address" />
              </div>
              <div>
                <label class="bd-label" for="a-city">City</label>
                <input id="a-city" class="bd-input" formControlName="city" />
              </div>
              <div>
                <label class="bd-label" for="a-state">State</label>
                <input id="a-state" class="bd-input" formControlName="state" />
              </div>
            </fieldset>
            @if (auth.canManageTeam()) {
              <button type="submit" class="bd-btn-primary" [disabled]="savingAgency() || agencyForm.pristine">
                {{ savingAgency() ? 'Saving…' : 'Save agency details' }}
              </button>
            } @else {
              <p class="bd-hint">Only owners and admins can change agency details.</p>
            }
          }
        </form>

        <div class="bd-card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 class="text-base font-semibold">Leave {{ auth.activeMembership()?.agencyName }}</h2>
            <p class="text-sm text-slate-600">You'll lose access to this agency's data. An agency must always keep one owner.</p>
          </div>
          <button type="button" class="bd-btn-secondary text-red-700" (click)="leave()">Leave agency</button>
        </div>
      }
    </section>
  `,
})
export class SettingsPage {
  protected readonly auth = inject(AuthStore);
  private readonly api = inject(AgencyApiService);
  private readonly toasts = inject(ToastService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly savingProfile = signal(false);
  protected readonly savingPassword = signal(false);
  protected readonly savingAgency = signal(false);

  protected readonly profile = this.fb.group({
    name: [this.auth.user()?.name ?? '', [Validators.required, Validators.minLength(2), Validators.maxLength(150)]],
    phone: [formatIndianPhone(this.auth.user()?.phone), indianMobile],
  });

  protected readonly password = this.fb.group(
    {
      currentPassword: ['', Validators.required],
      password: ['', [Validators.required, strongPassword]],
      confirmPassword: ['', Validators.required],
    },
    { validators: matchingPasswords() },
  );

  protected readonly agencyForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(150)]],
    phone: [''],
    email: ['', [Validators.email]],
    address: [''],
    city: [''],
    state: [''],
  });

  /** Reloads whenever the active agency changes. */
  protected readonly agency = rxResource({
    params: () => this.auth.activeAgencyId(),
    stream: ({ params: agencyId }) => (agencyId ? this.api.getCurrent() : of(undefined)),
  });

  constructor() {
    // Side effect: copy loaded server data into the (non-signal) reactive form.
    effect(() => {
      const a = this.agency.value();
      if (!a) return;
      this.agencyForm.reset({
        name: a.name,
        phone: a.phone ?? '',
        email: a.email ?? '',
        address: a.address ?? '',
        city: a.city ?? '',
        state: a.state ?? '',
      });
    });
  }

  protected async saveProfile(): Promise<void> {
    this.profile.markAllAsTouched();
    if (this.profile.invalid) return;
    this.savingProfile.set(true);
    try {
      const user = await firstValueFrom(this.api.updateProfile(this.profile.getRawValue()));
      this.auth.updateUser(user);
      this.profile.reset({ name: user.name, phone: formatIndianPhone(user.phone) });
      this.toasts.success('Profile saved');
    } catch (e: unknown) {
      this.toasts.error(errorMessage(e));
    } finally {
      this.savingProfile.set(false);
    }
  }

  protected async changePassword(): Promise<void> {
    this.password.markAllAsTouched();
    if (this.password.invalid) return;
    this.savingPassword.set(true);
    try {
      const v = this.password.getRawValue();
      await this.auth.changePassword(v.currentPassword, v.password);
      this.password.reset();
      this.toasts.success('Password updated. Other devices have been signed out.');
    } catch (e: unknown) {
      this.toasts.error(errorMessage(e));
    } finally {
      this.savingPassword.set(false);
    }
  }

  protected async saveAgency(): Promise<void> {
    this.agencyForm.markAllAsTouched();
    if (this.agencyForm.invalid) return;
    this.savingAgency.set(true);
    try {
      const updated = await firstValueFrom(this.api.updateCurrent(this.agencyForm.getRawValue()));
      this.agency.set(updated);
      // The agency name also appears in the session (header switcher).
      await this.auth.refreshAccessToken();
      this.toasts.success('Agency details saved');
    } catch (e: unknown) {
      this.toasts.error(errorMessage(e));
    } finally {
      this.savingAgency.set(false);
    }
  }

  protected async leave(): Promise<void> {
    const name = this.auth.activeMembership()?.agencyName ?? 'this agency';
    const ok = await this.confirm.ask({
      title: `Leave ${name}?`,
      message: 'You will immediately lose access to its leads, properties and team.',
      confirmText: 'Leave agency',
      danger: true,
    });
    if (!ok) return;
    try {
      await firstValueFrom(this.api.leaveCurrent());
      await this.auth.refreshAccessToken();
      this.toasts.success(`You left ${name}`);
      await this.router.navigateByUrl(this.auth.hasAgency() ? '/dashboard' : '/onboarding');
    } catch (e: unknown) {
      this.toasts.error(errorMessage(e));
    }
  }
}
