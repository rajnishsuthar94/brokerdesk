import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { AcceptInvitationResponse, InvitationPreview } from '@brokerdesk/shared-types';
import type { Observable } from 'rxjs';
import { API_BASE_URL } from '../../../core/config/api.config';

/** Invitee side of invitations. The token is sent in the body, never in a URL path. */
@Injectable({ providedIn: 'root' })
export class InvitationApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_BASE_URL)}/invitations`;

  preview(token: string): Observable<InvitationPreview> {
    return this.http.post<InvitationPreview>(`${this.base}/preview`, { token });
  }

  accept(token: string): Observable<AcceptInvitationResponse> {
    return this.http.post<AcceptInvitationResponse>(`${this.base}/accept`, { token });
  }
}
