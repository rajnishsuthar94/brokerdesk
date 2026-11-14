import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { AgencyDetails, SessionUser } from '@brokerdesk/shared-types';
import type { Observable } from 'rxjs';
import { API_BASE_URL } from '../config/api.config';

export interface AgencyInput {
  readonly name: string;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly address?: string | null;
  readonly city?: string | null;
  readonly state?: string | null;
}

/** Agency-level and profile endpoints shared by onboarding and settings. */
@Injectable({ providedIn: 'root' })
export class AgencyApiService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  create(body: AgencyInput): Observable<AgencyDetails> {
    return this.http.post<AgencyDetails>(`${this.base}/agencies`, body);
  }

  getCurrent(): Observable<AgencyDetails> {
    return this.http.get<AgencyDetails>(`${this.base}/agencies/current`);
  }

  updateCurrent(body: Partial<AgencyInput>): Observable<AgencyDetails> {
    return this.http.patch<AgencyDetails>(`${this.base}/agencies/current`, body);
  }

  leaveCurrent(): Observable<void> {
    return this.http.post<void>(`${this.base}/agencies/current/leave`, {});
  }

  updateProfile(body: { name?: string; phone?: string }): Observable<SessionUser> {
    return this.http.patch<SessionUser>(`${this.base}/users/me`, body);
  }
}
