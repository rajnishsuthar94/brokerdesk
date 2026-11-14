import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth.store';
import { ToastService } from '../../../core/services/toast.service';
import { errorMessage } from '../../../shared/utils/http-error';
import { InvitationApiService } from '../services/invitation-api.service';

const ROLE_LABEL: Readonly<Record<string, string>> = { OWNER: 'Owner', ADMIN: 'Admin', AGENT: 'Agent' };

@Component({
  selector: 'bd-accept-invite-page',
  imports: [RouterLink],
  template: `
    <section class="bd-card sm:p-8">
      @if (!token()) {
        <h1 class="text-2xl font-semibold tracking-tight">Invitation</h1>
        <p class="bd-alert-error mt-4" role="alert">This invitation link is incomplete. Please open the full link you received.</p>
      } @else if (preview.isLoading()) {
        <div class="space-y-3" aria-busy="true">
          <div class="h-7 w-2/3 animate-pulse rounded bg-slate-100"></div>
          <div class="h-4 w-full animate-pulse rounded bg-slate-100"></div>
          <div class="h-11 w-full animate-pulse rounded-lg bg-slate-100"></div>
        </div>
      } @else if (preview.error()) {
        <h1 class="text-2xl font-semibold tracking-tight">Invitation not available</h1>
        <p class="bd-alert-error mt-4" role="alert">{{ previewError() }}</p>
      } @else if (preview.value(); as invite) {
        <h1 class="text-2xl font-semibold tracking-tight">Join {{ invite.agencyName }}</h1>
        <p class="mt-2 text-sm text-slate-600">
          {{ invite.invitedByName }} invited <strong>{{ invite.email }}</strong> to join as
          <strong>{{ roleLabel(invite.role) }}</strong>.
        </p>

        @if (auth.isAuthenticated()) {
          @if (emailMatches()) {
            @if (error(); as message) {
              <p class="bd-alert-error mt-4" role="alert">{{ message }}</p>
            }
            <button type="button" class="bd-btn-primary mt-6 w-full" (click)="accept()" [disabled]="accepting()">
              {{ accepting() ? 'Joining…' : 'Accept invitation' }}
            </button>
          } @else {
            <p class="bd-alert-error mt-4" role="alert">
              You're logged in as {{ auth.user()?.email }}. Log out and log in as {{ invite.email }} to accept.
            </p>
            <button type="button" class="bd-btn-secondary mt-4 w-full" (click)="auth.logout()">Log out</button>
          }
        } @else {
          <div class="mt-6 flex flex-col gap-2">
            <a class="bd-btn-primary" [routerLink]="['/register']" [queryParams]="{ returnUrl: currentUrl() }">Create an account</a>
            <a class="bd-btn-secondary" [routerLink]="['/login']" [queryParams]="{ returnUrl: currentUrl() }">I already have an account</a>
          </div>
          <p class="bd-hint mt-3">Use {{ invite.email }} so we can match your invitation.</p>
        }
      }
    </section>
  `,
})
export class AcceptInvitePage {
  protected readonly auth = inject(AuthStore);
  private readonly api = inject(InvitationApiService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  readonly token = input<string>();

  protected readonly preview = rxResource({
    params: () => this.token(),
    stream: ({ params: token }) => (token ? this.api.preview(token) : of(undefined)),
  });

  protected readonly previewError = computed(() => errorMessage(this.preview.error(), 'This invitation link is invalid or has expired.'));
  protected readonly emailMatches = computed(
    () => this.auth.user()?.email.toLowerCase() === this.preview.value()?.email.toLowerCase(),
  );
  protected readonly currentUrl = computed(() => `/invite?token=${encodeURIComponent(this.token() ?? '')}`);

  protected readonly accepting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected roleLabel(role: string): string {
    return ROLE_LABEL[role] ?? role;
  }

  protected async accept(): Promise<void> {
    const token = this.token();
    if (!token || this.accepting()) return;
    this.accepting.set(true);
    this.error.set(null);
    try {
      const { agencyId } = await firstValueFrom(this.api.accept(token));
      await this.auth.switchAgency(agencyId);
      this.toasts.success(`Welcome to ${this.preview.value()?.agencyName ?? 'your new agency'}!`);
      await this.router.navigateByUrl('/dashboard');
    } catch (e: unknown) {
      this.error.set(errorMessage(e));
    } finally {
      this.accepting.set(false);
    }
  }
}
