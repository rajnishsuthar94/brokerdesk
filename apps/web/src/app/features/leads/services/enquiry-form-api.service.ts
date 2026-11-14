import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { EnquiryFormSettings } from '@brokerdesk/shared-types';
import type { Observable } from 'rxjs';
import { API_BASE_URL } from '../../../core/config/api.config';

/** The agency's own enquiry form settings (link, on/off, reset). */
@Injectable({ providedIn: 'root' })
export class EnquiryFormApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_BASE_URL)}/agencies/current/enquiry-form`;

  get(): Observable<EnquiryFormSettings> {
    return this.http.get<EnquiryFormSettings>(this.base);
  }

  setEnabled(enabled: boolean): Observable<EnquiryFormSettings> {
    return this.http.patch<EnquiryFormSettings>(this.base, { enabled });
  }

  resetLink(): Observable<EnquiryFormSettings> {
    return this.http.post<EnquiryFormSettings>(`${this.base}/reset-link`, {});
  }
}
