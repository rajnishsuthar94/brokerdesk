import { HttpClient, HttpParams, type HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  ImportDuplicateStrategy,
  LeadActivityView,
  LeadImportResult,
  LeadInput,
  LeadListQuery,
  LeadStatus,
  LeadView,
  Paginated,
  UserLeadActivityType,
} from '@brokerdesk/shared-types';
import type { Observable } from 'rxjs';
import { API_BASE_URL } from '../../../core/config/api.config';

/** Converts a list query to HTTP params (arrays become repeated params; empty values are dropped). */
export function toLeadParams(query: LeadListQuery): HttpParams {
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

/** HTTP calls for /leads. The agency is never sent: the API derives it from the session. */
@Injectable({ providedIn: 'root' })
export class LeadsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_BASE_URL)}/leads`;

  private url(id: string, suffix = ''): string {
    return `${this.base}/${encodeURIComponent(id)}${suffix}`;
  }

  list(query: LeadListQuery): Observable<Paginated<LeadView>> {
    return this.http.get<Paginated<LeadView>>(this.base, { params: toLeadParams(query) });
  }

  get(id: string): Observable<LeadView> {
    return this.http.get<LeadView>(this.url(id));
  }

  create(body: LeadInput): Observable<LeadView> {
    return this.http.post<LeadView>(this.base, body);
  }

  update(id: string, body: Partial<LeadInput>): Observable<LeadView> {
    return this.http.patch<LeadView>(this.url(id), body);
  }

  changeStatus(id: string, status: LeadStatus, note?: string): Observable<LeadView> {
    return this.http.patch<LeadView>(this.url(id, '/status'), { status, ...(note ? { note } : {}) });
  }

  assign(id: string, assignedUserId: string | null): Observable<LeadView> {
    return this.http.patch<LeadView>(this.url(id, '/assignee'), { assignedUserId });
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(this.url(id));
  }

  activities(id: string): Observable<LeadActivityView[]> {
    return this.http.get<LeadActivityView[]>(this.url(id, '/activities'));
  }

  addActivity(id: string, activityType: UserLeadActivityType, description: string): Observable<LeadActivityView> {
    return this.http.post<LeadActivityView>(this.url(id, '/activities'), { activityType, description });
  }

  /** CSV of the leads matching the filters (paging ignored). */
  exportCsv(query: LeadListQuery): Observable<HttpResponse<Blob>> {
    const filters: LeadListQuery = { ...query, page: undefined, pageSize: undefined };
    return this.http.get(`${this.base}/export`, { params: toLeadParams(filters), responseType: 'blob', observe: 'response' });
  }

  import(file: File, mode: 'preview' | 'commit', duplicates: ImportDuplicateStrategy): Observable<LeadImportResult> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<LeadImportResult>(`${this.base}/import`, form, { params: { mode, duplicates } });
  }
}
