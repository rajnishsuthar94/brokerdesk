import { Component, inject, signal, viewChild } from '@angular/core';
import { assignableRoles, type MemberRole, type TeamMember } from '@brokerdesk/shared-types';
import { AuthStore } from '../../../core/auth/auth.store';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmDialogService } from '../../../shared/components/confirm-dialog';
import { IndianPhonePipe, IstDatePipe } from '../../../shared/pipes/format.pipes';
import { errorMessage } from '../../../shared/utils/http-error';
import { ROLE_LABELS } from '../../../shared/utils/labels';
import { whatsappShareUrl } from '../../../shared/utils/whatsapp';
import { InviteForm, type InviteRequest } from '../components/invite-form';
import { TeamStore } from '../store/team.store';

interface CreatedInvite {
  readonly email: string;
  readonly url: string;
  readonly whatsappUrl: string;
}

@Component({
  selector: 'bd-team-page',
  imports: [InviteForm, IstDatePipe, IndianPhonePipe],
  providers: [TeamStore],
  template: `
    <section class="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 class="text-2xl font-semibold tracking-tight">Team</h1>
        <p class="mt-1 text-sm text-slate-600">People who work in {{ auth.activeMembership()?.agencyName }}.</p>
      </header>

      @if (store.canManage() && auth.role(); as myRole) {
        <article class="bd-card" aria-labelledby="invite-title">
          <h2 id="invite-title" class="text-base font-semibold">Invite a team member</h2>
          <p class="mt-1 mb-4 text-sm text-slate-600">
            You'll get a link to share on WhatsApp. Only the invited email address can accept it.
          </p>
          <bd-invite-form [myRole]="myRole" [busy]="inviting()" (invite)="onInvite($event)" />

          @if (lastInvite(); as inv) {
            <div class="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4" role="status">
              <p class="text-sm font-medium text-emerald-900">Invitation created for {{ inv.email }}</p>
              <p class="mt-1 break-all rounded bg-white p-2 font-mono text-xs text-slate-700">{{ inv.url }}</p>
              <div class="mt-3 flex flex-wrap gap-2">
                <a class="bd-btn bg-[#25D366] text-white hover:bg-[#1ebe5b]" [href]="inv.whatsappUrl" target="_blank" rel="noopener">
                  Share on WhatsApp
                </a>
                <button type="button" class="bd-btn-secondary" (click)="copy(inv.url)">Copy link</button>
              </div>
            </div>
          }
        </article>
      }

      <article class="bd-card p-0" aria-labelledby="members-title">
        <h2 id="members-title" class="border-b border-slate-200 px-5 py-4 text-base font-semibold">
          Members @if (store.status() === 'loaded') {<span class="font-normal text-slate-500">({{ store.memberCount() }})</span>}
        </h2>

        @switch (store.status()) {
          @case ('error') {
            <div class="p-5">
              <p class="bd-alert-error" role="alert">{{ store.error() }}</p>
              <button type="button" class="bd-btn-secondary mt-3" (click)="store.load()">Try again</button>
            </div>
          }
          @case ('loaded') {
            <ul class="divide-y divide-slate-100">
              @for (m of store.members(); track m.memberId) {
                <li class="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center" data-testid="team-member">
                  <div class="flex min-w-0 flex-1 items-center gap-3">
                    <span class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-100 font-semibold text-brand-800" aria-hidden="true">
                      {{ m.name.charAt(0).toUpperCase() }}
                    </span>
                    <div class="min-w-0">
                      <p class="truncate font-medium">
                        {{ m.name }}
                        @if (m.memberId === store.myMemberId()) { <span class="text-xs font-normal text-slate-500">(you)</span> }
                      </p>
                      <p class="truncate text-sm text-slate-500">{{ m.email }}@if (m.phone) { · {{ m.phone | indianPhone }}}</p>
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    @if (store.canEdit(m) && auth.role(); as myRole) {
                      <label class="sr-only" [attr.for]="'role-' + m.memberId">Role for {{ m.name }}</label>
                      <select [id]="'role-' + m.memberId" class="bd-input w-auto min-w-28" [value]="m.role"
                              [disabled]="store.isBusy(m.memberId)" (change)="onRoleChange(m, $event)">
                        @for (r of rolesFor(myRole, m.role); track r) {
                          <option [value]="r" [selected]="r === m.role">{{ roleLabels[r] }}</option>
                        }
                      </select>
                      <button type="button" class="bd-btn-secondary text-red-700" [disabled]="store.isBusy(m.memberId)" (click)="onRemove(m)">
                        Remove
                      </button>
                    } @else {
                      <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{{ roleLabels[m.role] }}</span>
                    }
                  </div>
                </li>
              }
            </ul>
          }
          @default {
            <div class="space-y-3 p-5" aria-busy="true">
              @for (i of [1, 2, 3]; track i) {
                <div class="h-12 animate-pulse rounded-lg bg-slate-100"></div>
              }
            </div>
          }
        }
      </article>

      @if (store.canManage() && store.invitations().length > 0) {
        <article class="bd-card p-0" aria-labelledby="pending-title">
          <h2 id="pending-title" class="border-b border-slate-200 px-5 py-4 text-base font-semibold">Pending invitations</h2>
          <ul class="divide-y divide-slate-100">
            @for (inv of store.invitations(); track inv.id) {
              <li class="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center">
                <div class="min-w-0 flex-1">
                  <p class="truncate font-medium">{{ inv.email }}</p>
                  <p class="text-sm text-slate-500">
                    {{ roleLabels[inv.role] }} · invited by {{ inv.invitedByName }} · expires {{ inv.expiresAt | istDate }}
                  </p>
                </div>
                <button type="button" class="bd-btn-secondary" [disabled]="store.isBusy(inv.id)" (click)="onRevoke(inv.id, inv.email)">
                  Cancel invitation
                </button>
              </li>
            }
          </ul>
        </article>
      }
    </section>
  `,
})
export class TeamPage {
  protected readonly store = inject(TeamStore);
  protected readonly auth = inject(AuthStore);
  private readonly toasts = inject(ToastService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly inviteForm = viewChild(InviteForm);

  protected readonly roleLabels = ROLE_LABELS;
  protected readonly inviting = signal(false);
  protected readonly lastInvite = signal<CreatedInvite | null>(null);

  constructor() {
    void this.store.load();
  }

  /** Roles to offer for a member: what I may assign, plus their current role. */
  protected rolesFor(myRole: MemberRole, current: MemberRole): MemberRole[] {
    const roles = assignableRoles(myRole);
    return roles.includes(current) ? roles : [current, ...roles];
  }

  protected async onInvite(req: InviteRequest): Promise<void> {
    this.inviting.set(true);
    try {
      const created = await this.store.invite(req.email, req.role);
      const agency = this.auth.activeMembership()?.agencyName ?? 'our agency';
      this.lastInvite.set({
        email: created.invitation.email,
        url: created.inviteUrl,
        whatsappUrl: whatsappShareUrl(`You're invited to join ${agency} on BrokerDesk. Accept here: ${created.inviteUrl}`),
      });
      this.inviteForm()?.reset();
      this.toasts.success(`Invitation created for ${created.invitation.email}`);
    } catch (e: unknown) {
      this.toasts.error(errorMessage(e));
    } finally {
      this.inviting.set(false);
    }
  }

  protected async onRoleChange(member: TeamMember, event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;
    const role = select.value as MemberRole;
    if (role === member.role) return;
    try {
      await this.store.changeRole(member.memberId, role);
      this.toasts.success(`${member.name} is now ${ROLE_LABELS[role]}`);
    } catch (e: unknown) {
      select.value = member.role;
      this.toasts.error(errorMessage(e));
    }
  }

  protected async onRemove(member: TeamMember): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Remove ${member.name}?`,
      message: 'They will lose access to this agency immediately. Leads and properties assigned to them will become unassigned.',
      confirmText: 'Remove',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.store.removeMember(member.memberId);
      this.toasts.success(`${member.name} was removed`);
    } catch (e: unknown) {
      this.toasts.error(errorMessage(e));
    }
  }

  protected async onRevoke(invitationId: string, email: string): Promise<void> {
    try {
      await this.store.revokeInvitation(invitationId);
      this.toasts.success(`Invitation for ${email} cancelled`);
    } catch (e: unknown) {
      this.toasts.error(errorMessage(e));
    }
  }

  protected async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.toasts.success('Link copied');
    } catch {
      this.toasts.error('Could not copy. Please select the link and copy it manually.');
    }
  }
}
