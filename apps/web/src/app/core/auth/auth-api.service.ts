import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  LoginRequest,
  RegisterRequest,
  SessionResponse,
  SessionUser,
  MembershipSummary,
} from '@brokerdesk/shared-types';
import type { Observable } from 'rxjs';
import { API_BASE_URL } from '../config/api.config';

/**
 * Required by the API on cookie-authenticated endpoints (refresh, logout):
 * cross-site forms cannot set custom headers, so this blocks CSRF.
 */
const CLIENT_HEADERS = new HttpHeaders({ 'X-BrokerDesk-Client': 'web' });

export interface MeResponse {
  readonly user: SessionUser;
  readonly memberships: readonly MembershipSummary[];
  readonly activeAgencyId: string | null;
}

/** HTTP calls for /auth/*. The refresh token is an HttpOnly cookie the app never sees. */
@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_BASE_URL)}/auth`;

  register(body: RegisterRequest): Observable<SessionResponse> {
    return this.http.post<SessionResponse>(`${this.base}/register`, body);
  }

  login(body: LoginRequest): Observable<SessionResponse> {
    return this.http.post<SessionResponse>(`${this.base}/login`, body);
  }

  refresh(agencyId: string | null): Observable<SessionResponse> {
    return this.http.post<SessionResponse>(
      `${this.base}/refresh`,
      agencyId ? { agencyId } : {},
      { headers: CLIENT_HEADERS },
    );
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${this.base}/logout`, {}, { headers: CLIENT_HEADERS });
  }

  switchAgency(agencyId: string): Observable<SessionResponse> {
    return this.http.post<SessionResponse>(`${this.base}/switch-agency`, { agencyId });
  }

  forgotPassword(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.base}/forgot-password`, { email });
  }

  resetPassword(token: string, password: string): Observable<void> {
    return this.http.post<void>(`${this.base}/reset-password`, { token, password });
  }

  changePassword(currentPassword: string, newPassword: string): Observable<SessionResponse> {
    return this.http.post<SessionResponse>(`${this.base}/change-password`, { currentPassword, newPassword });
  }
}

/** Auth endpoints the interceptor must never attach tokens to or retry. */
export const AUTH_ENDPOINT_PATTERN = /\/auth\/(login|register|refresh|logout|forgot-password|reset-password)$/;
