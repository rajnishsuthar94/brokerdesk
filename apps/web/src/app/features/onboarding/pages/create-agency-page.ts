import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth.store';
import { AgencyApiService } from '../../../core/services/agency-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { FieldError } from '../../../shared/components/field-error';
import { errorMessage } from '../../../shared/utils/http-error';

/**
 * Shown to signed-in users without an agency (e.g. registered to accept an
 * invitation), and reachable later to open another branch/agency.
 */
@Component({
  selector: 'bd-create-agency-page',
  imports: [ReactiveFormsModule, FieldError],
  template: `
    <section class="mx-auto max-w-lg space-y-6">
      <header>
        <h1 class="text-2xl font-semibold tracking-tight">
          {{ auth.hasAgency() ? 'Create another agency' : 'Set up your agency' }}
        </h1>
        <p class="mt-1 text-sm text-slate-600">
          @if (auth.hasAgency()) {
            Each agency has its own leads, properties and team. You can switch between them anytime.
          } @else {
            Create your agency to start adding leads and properties. Joining an existing agency?
            Ask its owner to send you an invitation link.
          }
        </p>
      </header>

      <form class="bd-card space-y-4" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div>
          <label class="bd-label" for="name">Agency name</label>
          <input id="name" class="bd-input" formControlName="name" autocomplete="organization" placeholder="e.g. Sabarmati Realty" />
          <bd-field-error [control]="form.controls.name" />
        </div>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label class="bd-label" for="city">City</label>
            <input id="city" class="bd-input" formControlName="city" autocomplete="address-level2" />
          </div>
          <div>
            <label class="bd-label" for="state">State</label>
            <input id="state" class="bd-input" formControlName="state" autocomplete="address-level1" />
          </div>
        </div>
        @if (error(); as message) {
          <p class="bd-alert-error" role="alert">{{ message }}</p>
        }
        <button type="submit" class="bd-btn-primary w-full sm:w-auto" [disabled]="submitting()">
          {{ submitting() ? 'Creating…' : 'Create agency' }}
        </button>
      </form>
    </section>
  `,
})
export class CreateAgencyPage {
  protected readonly auth = inject(AuthStore);
  private readonly api = inject(AgencyApiService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(150)]],
    city: ['Ahmedabad', Validators.maxLength(100)],
    state: ['Gujarat', Validators.maxLength(100)],
  });

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.submitting()) return;
    this.submitting.set(true);
    this.error.set(null);
    try {
      const agency = await firstValueFrom(this.api.create(this.form.getRawValue()));
      await this.auth.switchAgency(agency.id);
      this.toasts.success(`${agency.name} is ready.`);
      await this.router.navigateByUrl('/dashboard');
    } catch (e: unknown) {
      this.error.set(errorMessage(e));
    } finally {
      this.submitting.set(false);
    }
  }
}
