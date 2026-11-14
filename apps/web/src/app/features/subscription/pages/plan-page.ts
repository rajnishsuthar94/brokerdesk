import { Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { type PlanInfo, type SubscriptionPlan, type SubscriptionSummary, formatInrShort, usageRatio } from '@brokerdesk/shared-types';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth.store';
import { BusinessApiService } from '../../../core/services/business-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { IstDatePipe } from '../../../shared/pipes/format.pipes';
import { errorMessage } from '../../../shared/utils/http-error';

const STATUS_LABELS: Readonly<Record<SubscriptionSummary['status'], string>> = {
  TRIALING: 'Trial',
  ACTIVE: 'Active',
  PAST_DUE: 'Payment due',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
};

interface Meter {
  readonly label: string;
  readonly used: number;
  readonly limit: number | null;
  readonly note?: string;
}

/**
 * Plan & usage. There is no online payment: owners/admins send an upgrade
 * request; the BrokerDesk team arranges payment and applies the plan.
 */
@Component({
  selector: 'bd-plan-page',
  imports: [RouterLink, IstDatePipe],
  template: `
    <section class="mx-auto max-w-4xl space-y-5">
      <a routerLink="/settings" class="bd-link text-sm">‹ Settings</a>
      <h1 class="text-2xl font-semibold tracking-tight">Plan & usage</h1>

      @if (summary.error()) {
        <p class="bd-alert-error" role="alert">{{ error() }}</p>
      } @else if (!data()) {
        <div class="h-48 animate-pulse rounded-2xl bg-slate-100" aria-busy="true"></div>
      } @else {
        @let s = data()!;
        <article class="bd-card space-y-5" aria-labelledby="current-plan-title" data-testid="current-plan">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="current-plan-title" class="text-lg font-semibold">{{ s.displayName }} plan</h2>
              <p class="text-sm text-slate-600">
                {{ statusLabels[s.status] }}
                @if (s.expiresAt) { · {{ s.active ? 'renews / ends' : 'ended' }} on {{ s.expiresAt | istDate }} }
              </p>
            </div>
            @if (!s.active) {
              <p class="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900" role="status">
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M12 8v5M12 16.5v.5M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/></svg>
                Plan ended — Free limits apply until renewed. Your data is safe.
              </p>
            }
          </div>

          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            @for (m of meters(); track m.label) {
              <div data-testid="usage-meter">
                <div class="flex items-baseline justify-between text-sm">
                  <span class="font-medium">{{ m.label }}</span>
                  <span class="tabular-nums text-slate-700">{{ m.used }} of {{ m.limit === null ? 'unlimited' : m.limit }}</span>
                </div>
                @if (m.limit !== null) {
                  <div class="mt-1.5 h-2 overflow-hidden rounded-full bg-[#cde2fb]" role="meter" [attr.aria-label]="m.label"
                       aria-valuemin="0" [attr.aria-valuemax]="m.limit" [attr.aria-valuenow]="m.used">
                    <div class="h-full rounded-full bg-[#2a78d6]" [style.width.%]="ratio(m) * 100"></div>
                  </div>
                  @if (ratio(m) >= 1) {
                    <p class="mt-1 text-xs font-medium text-red-700">Limit reached</p>
                  } @else if (ratio(m) >= 0.8) {
                    <p class="mt-1 text-xs font-medium text-amber-800">Almost full</p>
                  }
                }
                @if (m.note) { <p class="mt-1 text-xs text-slate-500">{{ m.note }}</p> }
              </div>
            }
          </div>
        </article>

        <article aria-labelledby="plans-title">
          <h2 id="plans-title" class="mb-3 text-base font-semibold">Plans</h2>
          <ul class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            @for (p of s.plans; track p.plan) {
              <li class="bd-card flex flex-col gap-2 p-4" [class.ring-2]="p.plan === s.plan" [class.ring-brand-600]="p.plan === s.plan" data-testid="plan-card">
                <p class="font-semibold">{{ p.displayName }}</p>
                <p class="text-2xl font-semibold">{{ price(p) }}<span class="text-sm font-normal text-slate-500">{{ p.monthlyPricePaise ? ' / month' : '' }}</span></p>
                <ul class="space-y-1 text-sm text-slate-700">
                  <li>{{ p.leadLimit === null ? 'Unlimited' : p.leadLimit.toLocaleString('en-IN') }} leads</li>
                  <li>{{ p.userLimit === null ? 'Unlimited' : p.userLimit }} team member{{ p.userLimit === 1 ? '' : 's' }}</li>
                </ul>
                <div class="mt-auto pt-2">
                  @if (p.plan === s.plan && s.active) {
                    <span class="text-sm font-medium text-brand-800">Current plan</span>
                  } @else if (canRequest(p, s)) {
                    @if (auth.canManageTeam()) {
                      <button type="button" class="bd-btn-secondary w-full" (click)="choosing.set(p.plan)">{{ p.plan === s.plan ? 'Renew' : 'Request upgrade' }}</button>
                    }
                  }
                </div>
              </li>
            }
          </ul>
          <p class="mt-2 text-xs text-slate-500">Prices in INR. GST extra if applicable.</p>
        </article>

        @if (choosing(); as plan) {
          <form class="bd-card space-y-3" (submit)="$event.preventDefault(); send(plan)" aria-label="Upgrade request">
            <h2 class="text-base font-semibold">Request {{ planName(plan) }}</h2>
            <p class="text-sm text-slate-600">
              BrokerDesk doesn't take online payments yet. Send this request and our team will contact you to arrange
              payment and switch your plan@if (s.salesContact) {, or write to <strong>{{ s.salesContact }}</strong>}.
            </p>
            <div>
              <label class="bd-label" for="upgrade-note">Anything we should know? (optional)</label>
              <textarea id="upgrade-note" class="bd-input min-h-20 py-2" maxlength="1000" placeholder="e.g. Need 2 more seats from next month"
                        [value]="note()" (input)="note.set(valueOf($event))"></textarea>
            </div>
            <div class="flex flex-wrap gap-2">
              <button type="submit" class="bd-btn-primary" [disabled]="sending()">{{ sending() ? 'Sending…' : 'Send request' }}</button>
              <button type="button" class="bd-btn-secondary" (click)="choosing.set(null)">Cancel</button>
            </div>
          </form>
        }
        @if (s.lastUpgradeRequestAt) {
          <p class="text-sm text-slate-600" data-testid="last-request">Last upgrade request sent on {{ s.lastUpgradeRequestAt | istDate: 'datetime' }}.</p>
        }
        @if (!auth.canManageTeam()) {
          <p class="text-sm text-slate-600">Ask your agency owner or admin to change the plan.</p>
        }
      }
    </section>
  `,
})
export class PlanPage {
  protected readonly auth = inject(AuthStore);
  private readonly api = inject(BusinessApiService);
  private readonly toasts = inject(ToastService);

  protected readonly statusLabels = STATUS_LABELS;
  protected readonly summary = rxResource({ params: () => this.auth.activeAgencyId(), stream: () => this.api.subscription() });
  protected readonly data = computed<SubscriptionSummary | undefined>(() => (this.summary.hasValue() ? this.summary.value() : undefined));
  protected readonly error = computed(() => errorMessage(this.summary.error(), 'Could not load your plan.'));
  protected readonly meters = computed<Meter[]>(() => {
    const s = this.data();
    if (!s) return [];
    return [
      { label: 'Leads', used: s.usage.leads, limit: s.limits.leads },
      {
        label: 'Team members',
        used: s.usage.members + s.usage.pendingInvitations,
        limit: s.limits.users,
        note: s.usage.pendingInvitations ? `Includes ${s.usage.pendingInvitations} pending invitation${s.usage.pendingInvitations === 1 ? '' : 's'}` : undefined,
      },
    ];
  });

  protected readonly choosing = signal<SubscriptionPlan | null>(null);
  protected readonly note = signal('');
  protected readonly sending = signal(false);

  protected ratio(m: Meter): number {
    return usageRatio(m.used, m.limit) ?? 0;
  }

  protected price(p: PlanInfo): string {
    return p.monthlyPricePaise === 0 ? 'Free' : formatInrShort(p.monthlyPricePaise / 100);
  }

  protected planName(plan: SubscriptionPlan): string {
    return this.data()?.plans.find((p) => p.plan === plan)?.displayName ?? plan;
  }

  /** Higher plans while live; any paid plan (incl. the same one) once it has ended. */
  protected canRequest(p: PlanInfo, s: SubscriptionSummary): boolean {
    if (p.monthlyPricePaise === 0) return false;
    const order = s.plans.map((x) => x.plan);
    return !s.active || order.indexOf(p.plan) > order.indexOf(s.plan);
  }

  protected valueOf(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }

  protected async send(plan: SubscriptionPlan): Promise<void> {
    if (this.sending()) return;
    this.sending.set(true);
    try {
      await firstValueFrom(this.api.requestUpgrade(plan, this.note().trim() || undefined));
      this.toasts.success('Request sent. Our team will contact you shortly.');
      this.choosing.set(null);
      this.note.set('');
      this.summary.reload();
    } catch (e: unknown) {
      this.toasts.error(errorMessage(e));
    } finally {
      this.sending.set(false);
    }
  }
}
