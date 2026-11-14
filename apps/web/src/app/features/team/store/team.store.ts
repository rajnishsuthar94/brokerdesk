import { Injectable, computed, inject, signal } from '@angular/core';
import {
  MemberRole,
  canManageMember,
  type CreateInvitationResponse,
  type PendingInvitation,
  type TeamMember,
} from '@brokerdesk/shared-types';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth.store';
import { errorMessage } from '../../../shared/utils/http-error';
import { TeamApiService } from '../services/team-api.service';

type LoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

interface TeamState {
  readonly status: LoadStatus;
  readonly error: string | null;
  readonly members: readonly TeamMember[];
  readonly invitations: readonly PendingInvitation[];
  /** Ids with a request in flight (disables their buttons). */
  readonly busyIds: readonly string[];
}

const ROLE_ORDER: Readonly<Record<MemberRole, number>> = { OWNER: 0, ADMIN: 1, AGENT: 2 };

const initialState: TeamState = { status: 'idle', error: null, members: [], invitations: [], busyIds: [] };

/**
 * Team feature state. Provided by the Team page (not root), so it lives and dies
 * with the page. Actions throw on failure so the page can show a toast; state is
 * only changed after the server confirms.
 */
@Injectable()
export class TeamStore {
  private readonly api = inject(TeamApiService);
  private readonly auth = inject(AuthStore);
  private readonly state = signal<TeamState>(initialState);

  readonly status = computed(() => this.state().status);
  readonly error = computed(() => this.state().error);
  readonly invitations = computed(() => this.state().invitations);
  readonly members = computed(() =>
    [...this.state().members].sort(
      (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name),
    ),
  );
  readonly memberCount = computed(() => this.state().members.length);
  readonly canManage = this.auth.canManageTeam;
  readonly myMemberId = computed(() => this.auth.activeMembership()?.memberId ?? null);

  isBusy(id: string): boolean {
    return this.state().busyIds.includes(id);
  }

  /** UI hint only (the API enforces the same rule): can the current user edit `member`? */
  canEdit(member: TeamMember): boolean {
    const myRole = this.auth.role();
    return myRole !== null && member.memberId !== this.myMemberId() && canManageMember(myRole, member.role);
  }

  async load(): Promise<void> {
    this.state.update((s) => ({ ...s, status: 'loading', error: null }));
    try {
      const [members, invitations] = await Promise.all([
        firstValueFrom(this.api.members()),
        this.canManage() ? firstValueFrom(this.api.invitations()) : Promise.resolve([]),
      ]);
      this.state.update((s) => ({ ...s, status: 'loaded', members, invitations }));
    } catch (e: unknown) {
      this.state.update((s) => ({ ...s, status: 'error', error: errorMessage(e, 'Could not load your team.') }));
    }
  }

  async invite(email: string, role: MemberRole): Promise<CreateInvitationResponse> {
    const created = await firstValueFrom(this.api.invite(email, role));
    this.state.update((s) => ({
      ...s,
      // Re-inviting the same email replaces the previous pending invitation.
      invitations: [created.invitation, ...s.invitations.filter((i) => i.email !== created.invitation.email)],
    }));
    return created;
  }

  async changeRole(memberId: string, role: MemberRole): Promise<void> {
    await this.withBusy(memberId, async () => {
      const updated = await firstValueFrom(this.api.changeRole(memberId, role));
      this.state.update((s) => ({ ...s, members: s.members.map((m) => (m.memberId === memberId ? updated : m)) }));
    });
  }

  async removeMember(memberId: string): Promise<void> {
    await this.withBusy(memberId, async () => {
      await firstValueFrom(this.api.removeMember(memberId));
      this.state.update((s) => ({ ...s, members: s.members.filter((m) => m.memberId !== memberId) }));
    });
  }

  async revokeInvitation(invitationId: string): Promise<void> {
    await this.withBusy(invitationId, async () => {
      await firstValueFrom(this.api.revokeInvitation(invitationId));
      this.state.update((s) => ({ ...s, invitations: s.invitations.filter((i) => i.id !== invitationId) }));
    });
  }

  private async withBusy(id: string, work: () => Promise<void>): Promise<void> {
    this.state.update((s) => ({ ...s, busyIds: [...s.busyIds, id] }));
    try {
      await work();
    } finally {
      this.state.update((s) => ({ ...s, busyIds: s.busyIds.filter((b) => b !== id) }));
    }
  }
}
