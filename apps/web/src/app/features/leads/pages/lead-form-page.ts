import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { ApiErrorCode, canAssignLeads, type DuplicateLeadError, type LeadInput } from '@brokerdesk/shared-types';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, of } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth.store';
import { TeamDirectoryStore } from '../../../core/services/team-directory.store';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmDialogService } from '../../../shared/components/confirm-dialog';
import { apiErrorCode, errorMessage } from '../../../shared/utils/http-error';
import { LeadForm } from '../components/lead-form';
import { LeadsApiService } from '../services/leads-api.service';
import { LeadsListStore } from '../store/leads-list.store';

/** Create (`/leads/new`) and edit (`/leads/:id/edit`) a lead. */
@Component({
  selector: 'bd-lead-form-page',
  imports: [LeadForm, RouterLink],
  template: `
    <section class="mx-auto max-w-3xl space-y-4">
      <a [routerLink]="id() ? ['/leads', id()] : ['/leads']" class="bd-link text-sm">‹ Back</a>
      <h1 class="text-2xl font-semibold tracking-tight">{{ id() ? 'Edit lead' : 'Add a lead' }}</h1>

      @if (id() && existing.isLoading()) {
        <div class="h-96 animate-pulse rounded-2xl bg-slate-100" aria-busy="true"></div>
      } @else if (id() && existing.error()) {
        <p class="bd-alert-error" role="alert">{{ loadError() }}</p>
      } @else {
        <bd-lead-form [lead]="existing.value() ?? null" [members]="team.members()" [canAssign]="canAssign()"
                      [busy]="saving()" [submitLabel]="id() ? 'Save changes' : 'Add lead'"
                      (save)="onSave($event)" (cancelled)="goBack()" />
      }
    </section>
  `,
})
export class LeadFormPage {
  /** Route parameter; absent when creating. */
  readonly id = input<string>();

  protected readonly team = inject(TeamDirectoryStore);
  private readonly api = inject(LeadsApiService);
  private readonly listStore = inject(LeadsListStore);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  private readonly confirm = inject(ConfirmDialogService);

  protected readonly saving = signal(false);
  protected readonly canAssign = computed(() => {
    const role = this.auth.role();
    return role !== null && canAssignLeads(role);
  });

  protected readonly existing = rxResource({
    params: () => this.id(),
    stream: ({ params: id }) => (id ? this.api.get(id) : of(undefined)),
  });
  protected readonly loadError = computed(() => errorMessage(this.existing.error(), 'Could not load this lead.'));

  protected async onSave(input: LeadInput): Promise<void> {
    this.saving.set(true);
    try {
      const saved = await this.persist(input);
      if (!saved) return;
      this.listStore.reload();
      this.toasts.success(this.id() ? 'Lead updated' : `${saved.name} added`);
      await this.router.navigate(['/leads', saved.id]);
    } catch (e: unknown) {
      this.toasts.error(errorMessage(e));
    } finally {
      this.saving.set(false);
    }
  }

  /** Saves; on a duplicate phone, asks before saving a second lead with the same number. */
  private async persist(input: LeadInput): Promise<{ id: string; name: string } | null> {
    const id = this.id();
    try {
      return await firstValueFrom(id ? this.api.update(id, input) : this.api.create(input));
    } catch (e: unknown) {
      if (!(e instanceof HttpErrorResponse) || apiErrorCode(e) !== ApiErrorCode.DUPLICATE_LEAD) throw e;
      const dup = e.error as DuplicateLeadError;
      const saveAnyway = await this.confirm.ask({
        title: 'This number is already saved',
        message: `${dup.message}. Do you still want to save this as a separate lead?`,
        confirmText: 'Save anyway',
        cancelText: 'Go back',
      });
      if (!saveAnyway) return null; // stay on the form
      const retry = { ...input, allowDuplicate: true };
      return firstValueFrom(id ? this.api.update(id, retry) : this.api.create(retry));
    }
  }

  protected goBack(): void {
    const id = this.id();
    void this.router.navigate(id ? ['/leads', id] : ['/leads']);
  }
}
