import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { LeadMatch, Paginated, PropertyInput, PropertyListQuery, PropertyView } from '@brokerdesk/shared-types';
import type { Observable } from 'rxjs';
import { API_BASE_URL } from '../../../core/config/api.config';

export function toPropertyParams(query: PropertyListQuery): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(query) as [string, unknown][]) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const v of value as unknown[]) params = params.append(key, String(v));
    } else {
      params = params.set(key, String(value as string | number));
    }
  }
  return params;
}

/** HTTP calls for /properties. The agency is derived from the session by the API. */
@Injectable({ providedIn: 'root' })
export class PropertiesApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_BASE_URL)}/properties`;

  private url(id: string, suffix = ''): string {
    return `${this.base}/${encodeURIComponent(id)}${suffix}`;
  }

  list(query: PropertyListQuery): Observable<Paginated<PropertyView>> {
    return this.http.get<Paginated<PropertyView>>(this.base, { params: toPropertyParams(query) });
  }

  get(id: string): Observable<PropertyView> {
    return this.http.get<PropertyView>(this.url(id));
  }

  create(body: PropertyInput): Observable<PropertyView> {
    return this.http.post<PropertyView>(this.base, body);
  }

  update(id: string, body: Partial<PropertyInput>): Observable<PropertyView> {
    return this.http.patch<PropertyView>(this.url(id), body);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(this.url(id));
  }

  uploadImages(id: string, files: readonly Blob[], names: readonly string[]): Observable<PropertyView> {
    const form = new FormData();
    files.forEach((f, i) => form.append('files', f, names[i] ?? `photo-${i + 1}.jpg`));
    return this.http.post<PropertyView>(this.url(id, '/images'), form);
  }

  removeImage(id: string, imageId: string): Observable<PropertyView> {
    return this.http.delete<PropertyView>(this.url(id, `/images/${encodeURIComponent(imageId)}`));
  }

  reorderImages(id: string, imageIds: readonly string[]): Observable<PropertyView> {
    return this.http.put<PropertyView>(this.url(id, '/images/order'), { imageIds });
  }

  matchingLeads(id: string): Observable<LeadMatch[]> {
    return this.http.get<LeadMatch[]>(this.url(id, '/matches'));
  }
}
