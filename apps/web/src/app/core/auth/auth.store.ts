import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  ApiErrorCode,
  MemberRole,
  type LoginRequest,
  type MembershipSummary,
  type RegisterRequest,
  type SessionResponse,
  type SessionUser,
} from '@brokerdesk/shared-types';
import { firstValueFrom } from 'rxjs';
import { apiErrorCode } from '../../shared/utils/http-error';
import { AuthApiService } from './auth-api.service';

export type AuthStatus = 'unknown' | 'authenticated' | 'anonymous';

interface AuthState {
  readonly status: AuthStatus;
  readonly user: SessionUser | null;
  readonly memberships: readonly MembershipSummary[];
  readonly activeAgencyId: string | null;
}

const ANONYMOUS: AuthState = { status: 'anonymous', user: null, memberships: [], activeAgencyId: null };

/** Remembers which agency to reopen. Not sensitive: the server verifies membership. */
const LAST_AGENCY_KEY = 'bd.lastAgencyId';

function readLastAgency(): string | null {
  try {
    return localStorage.getItem(LAST_AGENCY_KEY);
  } catch {
    return null;
  }
}

function writeLastAgency(agencyId: string | null): void {
  try {
    if (agencyId) localStorage.setItem(LAST_AGENCY_KEY, agencyId);
  } catch {
    /* storage unavailable (private mode): ignore */
  }
}

/**
 * Authentication & active-agency state.
 *
 * - The access token lives only in memory (a private signal), never in storage,
 *   so XSS cannot read a persisted token. After a reload the session is restored
 *   through the HttpOnly refresh cookie.
 * - Concurrent 401s share one refresh request (single flight).
 * - The UI uses role/agency signals only for display; the API enforces access.
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly api = inject(AuthApiService);
  private readonly router = inject(Router);

  private readonly state = signal<AuthState>({ ...ANONYMOUS, status: 'unknown' });
  private readonly token = signal<string | null>(null);
  private refreshInFlight: Promise<string | null> | null = null;

  readonly accessToken = this.token.asReadonly();
  readonly status = computed(() => this.state().status);
  readonly user = computed(() => this.state().user);
  readonly memberships = computed(() => this.state().memberships);
  readonly activeAgencyId = computed(() => this.state().activeAgencyId);
  readonly isAuthenticated = computed(() => this.state().status === 'authenticated');
  readonly hasAgency = computed(() => this.state().activeAgencyId !== null);
  readonly activeMembership = computed(
    () => this.state().memberships.find((m) => m.agencyId === this.state().activeAgencyId) ?? null,
  );
  readonly role = computed(() => this.activeMembership()?.role ?? null);
  readonly canManageTeam = computed(() => this.role() === MemberRole.OWNER || this.role() === MemberRole.ADMIN);

  /** Called once at startup: restores the session from the refresh cookie, if any. */
  async restoreSession(): Promise<void> {
    await this.refreshAccessToken();
  }

  async login(body: Omit<LoginRequest, 'agencyId'>): Promise<void> {
    const agencyId = readLastAgency() ?? undefined;
    this.applySession(await firstValueFrom(this.api.login({ ...body, agencyId })));
  }

  async register(body: RegisterRequest): Promise<void> {
    this.applySession(await firstValueFrom(this.api.register(body)));
  }

  async switchAgency(agencyId: string): Promise<void> {
    this.applySession(await firstValueFrom(this.api.switchAgency(agencyId)));
  }

  /** After a password change the server returns a fresh session (other devices are signed out). */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    this.applySession(await firstValueFrom(this.api.changePassword(currentPassword, newPassword)));
  }

  updateUser(user: SessionUser): void {
    this.state.update((s) => ({ ...s, user }));
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.api.logout());
    } catch {
      /* the cookie is cleared server-side when possible; local state is cleared regardless */
    }
    this.clear();
    await this.router.navigate(['/login']);
  }

  /**
   * Gets a new access token using the refresh cookie. Concurrent callers share
   * one request. Resolves to the new token, or null if the session is over.
   */
  refreshAccessToken(): Promise<string | null> {
    this.refreshInFlight ??= this.doRefresh().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  /** The session ended (refresh failed): clear state and send the user to login. */
  async handleSessionExpired(): Promise<void> {
    this.clear();
    const returnUrl = this.router.url;
    await this.router.navigate(['/login'], {
      queryParams: returnUrl && !returnUrl.startsWith('/login') ? { returnUrl } : {},
    });
  }

  private async doRefresh(attempt = 1): Promise<string | null> {
    try {
      const session = await firstValueFrom(this.api.refresh(this.state().activeAgencyId ?? readLastAgency()));
      this.applySession(session);
      return session.accessToken;
    } catch (error: unknown) {
      // Another tab rotated the cookie a moment ago; the browser now has the new one.
      if (apiErrorCode(error) === ApiErrorCode.REFRESH_RACE && attempt === 1) {
        await new Promise((r) => setTimeout(r, 300));
        return this.doRefresh(2);
      }
      this.clear();
      return null;
    }
  }

  private applySession(session: SessionResponse): void {
    this.token.set(session.accessToken);
    this.state.set({
      status: 'authenticated',
      user: session.user,
      memberships: session.memberships,
      activeAgencyId: session.activeAgencyId,
    });
    writeLastAgency(session.activeAgencyId);
  }

  private clear(): void {
    this.token.set(null);
    this.state.set(ANONYMOUS);
  }
}
