import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { canDeleteProperties, type PropertyInput } from '@brokerdesk/shared-types';
import { firstValueFrom, of } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth.store';
import { TeamDirectoryStore } from '../../../core/services/team-directory.store';
import { ToastService } from '../../../core/services/toast.service';
import { errorMessage } from '../../../shared/utils/http-error';
import { PropertyForm } from '../components/property-form';
import { PropertiesApiService } from '../services/properties-api.service';
import { PropertiesListStore } from '../store/properties-list.store';

/** Create (`/properties/new`) and edit (`/properties/:id/edit`). Photos are added on the detail page. */
@Component({
  selector: 'bd-property-form-page',
  imports: [PropertyForm, RouterLink],
  template: `
    <section class="mx-auto max-w-3xl space-y-4">
      <a [routerLink]="id() ? ['/properties', id()] : ['/properties']" class="bd-link text-sm">‹ Back</a>
      <h1 class="text-2xl font-semibold tracking-tight">{{ id() ? 'Edit property' : 'Add a property' }}</h1>
      @if (!id()) { <p class="text-sm text-slate-600">You can add photos on the next screen.</p> }
      @if (id() && existing.isLoading()) {
        <div class="h-96 animate-pulse rounded-2xl bg-slate-100" aria-busy="true"></div>
      } @else if (id() && existing.error()) {
        <p class="bd-alert-error" role="alert">{{ loadError() }}</p>
      } @else {
        <bd-property-form [property]="existing.value() ?? null" [members]="team.members()" [canAssign]="canAssign()"
                          [busy]="saving()" [submitLabel]="id() ? 'Save changes' : 'Add property'"
                          (save)="onSave($event)" (cancelled)="goBack()" />
      }
    </section>
  `,
})
export class PropertyFormPage {
  readonly id = input<string>();
  protected readonly team = inject(TeamDirectoryStore);
  private readonly api = inject(PropertiesApiService);
  private readonly listStore = inject(PropertiesListStore);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  protected readonly saving = signal(false);
  protected readonly canAssign = computed(() => {
    const role = this.auth.role();
    return role !== null && canDeleteProperties(role);
  });
  protected readonly existing = rxResource({
    params: () => this.id(),
    stream: ({ params: id }) => (id ? this.api.get(id) : of(undefined)),
  });
  protected readonly loadError = computed(() => errorMessage(this.existing.error(), 'Could not load this property.'));

  protected async onSave(input: PropertyInput): Promise<void> {
    this.saving.set(true);
    try {
      const id = this.id();
      const saved = await firstValueFrom(id ? this.api.update(id, input) : this.api.create(input));
      this.listStore.reload();
      this.toasts.success(id ? 'Property updated' : 'Property added. Now add some photos.');
      await this.router.navigate(['/properties', saved.id]);
    } catch (e: unknown) {
      this.toasts.error(errorMessage(e));
    } finally {
      this.saving.set(false);
    }
  }

  protected goBack(): void {
    const id = this.id();
    void this.router.navigate(id ? ['/properties', id] : ['/properties']);
  }
}
