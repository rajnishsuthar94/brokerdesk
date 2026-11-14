import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { CreateInvitationResponse, MemberRole, PendingInvitation, TeamMember } from '@brokerdesk/shared-types';
import type { Observable } from 'rxjs';
import { API_BASE_URL } from '../../../core/config/api.config';

/** Team endpoints. The agency is never sent: the API derives it from the session. */
@Injectable({ providedIn: 'root' })
export class TeamApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_BASE_URL)}/agencies/current`;

  members(): Observable<TeamMember[]> {
    return this.http.get<TeamMember[]>(`${this.base}/members`);
  }

  changeRole(memberId: string, role: MemberRole): Observable<TeamMember> {
    return this.http.patch<TeamMember>(`${this.base}/members/${encodeURIComponent(memberId)}`, { role });
  }

  removeMember(memberId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/members/${encodeURIComponent(memberId)}`);
  }

  invitations(): Observable<PendingInvitation[]> {
    return this.http.get<PendingInvitation[]>(`${this.base}/invitations`);
  }

  invite(email: string, role: MemberRole): Observable<CreateInvitationResponse> {
    return this.http.post<CreateInvitationResponse>(`${this.base}/invitations`, { email, role });
  }

  revokeInvitation(invitationId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/invitations/${encodeURIComponent(invitationId)}`);
  }
}
