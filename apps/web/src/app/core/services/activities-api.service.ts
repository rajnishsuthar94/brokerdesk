import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  CompleteFollowUpRequest,
  CreateFollowUpRequest,
  CreateSiteVisitRequest,
  DashboardSummary,
  FollowUpListView,
  FollowUpView,
  Paginated,
  ReminderCounts,
  SiteVisitListView,
  SiteVisitView,
} from '@brokerdesk/shared-types';
import type { Observable } from 'rxjs';
import { API_BASE_URL } from '../config/api.config';

/** Follow-ups, site visits and the dashboard. All scoping happens on the server. */
@Injectable({ providedIn: 'root' })
export class ActivitiesApiService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  // ── follow-ups ─────────────────────────────────────────────────────────────
  followUps(view: FollowUpListView, page = 1, pageSize = 30): Observable<Paginated<FollowUpView>> {
    const params = new HttpParams().set('view', view).set('page', page).set('pageSize', pageSize);
    return this.http.get<Paginated<FollowUpView>>(`${this.base}/follow-ups`, { params });
  }

  followUpsForLead(leadId: string): Observable<FollowUpView[]> {
    return this.http.get<FollowUpView[]>(`${this.base}/leads/${encodeURIComponent(leadId)}/follow-ups`);
  }

  createFollowUp(body: CreateFollowUpRequest): Observable<FollowUpView> {
    return this.http.post<FollowUpView>(`${this.base}/follow-ups`, body);
  }

  rescheduleFollowUp(id: string, dueAt: string): Observable<FollowUpView> {
    return this.http.patch<FollowUpView>(`${this.base}/follow-ups/${encodeURIComponent(id)}`, { dueAt });
  }

  completeFollowUp(id: string, body: CompleteFollowUpRequest): Observable<FollowUpView> {
    return this.http.post<FollowUpView>(`${this.base}/follow-ups/${encodeURIComponent(id)}/complete`, body);
  }

  cancelFollowUp(id: string, reason?: string): Observable<FollowUpView> {
    return this.http.post<FollowUpView>(`${this.base}/follow-ups/${encodeURIComponent(id)}/cancel`, reason ? { reason } : {});
  }

  // ── site visits ────────────────────────────────────────────────────────────
  siteVisits(view: SiteVisitListView, page = 1, pageSize = 30): Observable<Paginated<SiteVisitView>> {
    const params = new HttpParams().set('view', view).set('page', page).set('pageSize', pageSize);
    return this.http.get<Paginated<SiteVisitView>>(`${this.base}/site-visits`, { params });
  }

  siteVisitsForLead(leadId: string): Observable<SiteVisitView[]> {
    return this.http.get<SiteVisitView[]>(`${this.base}/leads/${encodeURIComponent(leadId)}/site-visits`);
  }

  siteVisitsForProperty(propertyId: string): Observable<SiteVisitView[]> {
    return this.http.get<SiteVisitView[]>(`${this.base}/properties/${encodeURIComponent(propertyId)}/site-visits`);
  }

  createSiteVisit(body: CreateSiteVisitRequest): Observable<SiteVisitView> {
    return this.http.post<SiteVisitView>(`${this.base}/site-visits`, body);
  }

  rescheduleSiteVisit(id: string, scheduledAt: string): Observable<SiteVisitView> {
    return this.http.patch<SiteVisitView>(`${this.base}/site-visits/${encodeURIComponent(id)}`, { scheduledAt });
  }

  completeSiteVisit(id: string, feedback?: string): Observable<SiteVisitView> {
    return this.http.post<SiteVisitView>(`${this.base}/site-visits/${encodeURIComponent(id)}/complete`, feedback ? { feedback } : {});
  }

  cancelSiteVisit(id: string, reason?: string): Observable<SiteVisitView> {
    return this.http.post<SiteVisitView>(`${this.base}/site-visits/${encodeURIComponent(id)}/cancel`, reason ? { reason } : {});
  }

  // ── dashboard ──────────────────────────────────────────────────────────────
  dashboard(): Observable<DashboardSummary> {
    return this.http.get<DashboardSummary>(`${this.base}/dashboard`);
  }

  reminders(): Observable<ReminderCounts> {
    return this.http.get<ReminderCounts>(`${this.base}/dashboard/reminders`);
  }
}
