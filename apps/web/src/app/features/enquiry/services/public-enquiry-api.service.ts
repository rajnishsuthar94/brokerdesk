import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { PublicEnquiryInfo, PublicEnquiryRequest } from '@brokerdesk/shared-types';
import type { Observable } from 'rxjs';
import { API_BASE_URL } from '../../../core/config/api.config';

/** Unauthenticated calls used by the public enquiry page. */
@Injectable({ providedIn: 'root' })
export class PublicEnquiryApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_BASE_URL)}/public/enquiry`;

  info(slug: string): Observable<PublicEnquiryInfo> {
    return this.http.get<PublicEnquiryInfo>(`${this.base}/${encodeURIComponent(slug)}`);
  }

  submit(slug: string, body: PublicEnquiryRequest): Observable<{ received: true }> {
    return this.http.post<{ received: true }>(`${this.base}/${encodeURIComponent(slug)}`, body);
  }
}
