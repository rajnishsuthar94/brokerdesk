import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { LeadMatch, PropertyMatch } from '@brokerdesk/shared-types';
import type { Observable } from 'rxjs';
import { API_BASE_URL } from '../../../core/config/api.config';

/** Explainable buyer ↔ property matches (computed by the API). */
@Injectable({ providedIn: 'root' })
export class MatchingApiService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  propertiesForLead(leadId: string): Observable<PropertyMatch[]> {
    return this.http.get<PropertyMatch[]>(`${this.base}/leads/${encodeURIComponent(leadId)}/matches`);
  }

  leadsForProperty(propertyId: string): Observable<LeadMatch[]> {
    return this.http.get<LeadMatch[]>(`${this.base}/properties/${encodeURIComponent(propertyId)}/matches`);
  }
}
