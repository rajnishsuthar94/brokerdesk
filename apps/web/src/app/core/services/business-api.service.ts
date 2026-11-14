import { HttpClient, HttpParams, type HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  MessageTemplateInput,
  MessageTemplateView,
  ReportExportSection,
  ReportSummary,
  SubscriptionPlan,
  SubscriptionSummary,
} from '@brokerdesk/shared-types';
import type { Observable } from 'rxjs';
import { API_BASE_URL } from '../config/api.config';

/** Reports, subscription and message templates. */
@Injectable({ providedIn: 'root' })
export class BusinessApiService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  report(from: string, to: string): Observable<ReportSummary> {
    return this.http.get<ReportSummary>(`${this.base}/reports`, { params: new HttpParams().set('from', from).set('to', to) });
  }

  exportReport(from: string, to: string, section: ReportExportSection): Observable<HttpResponse<Blob>> {
    const params = new HttpParams().set('from', from).set('to', to).set('section', section);
    return this.http.get(`${this.base}/reports/export`, { params, responseType: 'blob', observe: 'response' });
  }

  subscription(): Observable<SubscriptionSummary> {
    return this.http.get<SubscriptionSummary>(`${this.base}/subscription`);
  }

  requestUpgrade(plan: SubscriptionPlan, note?: string): Observable<{ ok: true }> {
    return this.http.post<{ ok: true }>(`${this.base}/subscription/upgrade-request`, note ? { plan, note } : { plan });
  }

  templates(): Observable<MessageTemplateView[]> {
    return this.http.get<MessageTemplateView[]>(`${this.base}/message-templates`);
  }

  createTemplate(body: MessageTemplateInput): Observable<MessageTemplateView> {
    return this.http.post<MessageTemplateView>(`${this.base}/message-templates`, body);
  }

  updateTemplate(id: string, body: Partial<MessageTemplateInput>): Observable<MessageTemplateView> {
    return this.http.patch<MessageTemplateView>(`${this.base}/message-templates/${encodeURIComponent(id)}`, body);
  }

  deleteTemplate(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/message-templates/${encodeURIComponent(id)}`);
  }

  addDefaultTemplates(): Observable<MessageTemplateView[]> {
    return this.http.post<MessageTemplateView[]>(`${this.base}/message-templates/defaults`, {});
  }
}
