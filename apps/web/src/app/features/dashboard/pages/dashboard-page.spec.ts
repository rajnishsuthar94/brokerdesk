import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { DashboardSummary } from '@brokerdesk/shared-types';
import { SystemStatusStore } from '../../../core/services/system-status.store';
import { DashboardPage } from './dashboard-page';

const months = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
const SUMMARY: DashboardSummary = {
  scope: 'agency',
  totals: {
    totalLeads: 42, newLeadsThisMonth: 9, followUpsDueToday: 3, overdueFollowUps: 2,
    upcomingSiteVisits: 4, wonDeals: 5, lostLeads: 7, conversionRate: 11.9,
  },
  leadsBySource: [{ source: 'WALK_IN', count: 4 }, { source: 'PROPERTY_PORTAL', count: 30 }, { source: 'REFERRAL', count: 8 }],
  leadsByStatus: [{ status: 'NEW', count: 20 }, { status: 'WON', count: 5 }],
  monthlyEnquiries: months.map((month, i) => ({ month, count: i * 2 })),
  monthlySiteVisits: months.map((month, i) => ({ month, count: i, completed: Math.floor(i / 2) })),
  monthlyDeals: months.map((month, i) => ({ month, count: i === 5 ? 3 : 0, lost: 1 })),
  agenda: {
    followUps: [{
      id: 'f1', lead: { id: 'l1', name: 'Amit Mehta', phone: '+919825012345', status: 'CONTACTED' }, assignedUser: null,
      dueAt: '2026-11-01T05:30:00.000Z', status: 'PENDING', notes: 'Call about Shela 3BHK', completedAt: null, createdAt: '2026-10-30T05:30:00.000Z',
    }],
    siteVisits: [],
  },
};

describe('DashboardPage', () => {
  let http: HttpTestingController;

  const settle = async (): Promise<void> => {
    TestBed.tick();
    await new Promise((r) => setTimeout(r));
    TestBed.tick();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DashboardPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(summary: DashboardSummary | 'error' = SUMMARY): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(DashboardPage);
    await settle();
    const req = http.expectOne('/api/v1/dashboard');
    if (summary === 'error') req.flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    else req.flush(summary);
    await settle();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows KPI tiles with the real numbers', async () => {
    const el = await render();
    const text = (id: string): string => el.querySelector(`[data-testid="${id}"]`)?.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(text('kpi-total-leads')).toContain('42');
    expect(text('kpi-total-leads')).toContain('9 new this month');
    expect(text('kpi-overdue')).toContain('2');
    expect(text('kpi-overdue')).toContain('Needs attention'); // never colour alone
    expect(text('kpi-conversion')).toContain('11.9%');
  });

  it("lists today's agenda and every chart value in a table view", async () => {
    const el = await render();
    expect(el.textContent).toContain('Amit Mehta');
    expect(el.textContent).toContain('Call about Shela 3BHK');
    const tables = el.querySelectorAll('table');
    expect(tables).toHaveLength(3);
    expect(tables[0]!.textContent).toContain('November 2026');
    expect(tables[2]!.querySelector('thead')!.textContent).toContain('Won');
    expect(tables[2]!.querySelector('thead')!.textContent).toContain('Lost');
  });

  it('ranks lead sources (largest first) and keeps the pipeline in stage order', async () => {
    const el = await render();
    const sources = [...el.querySelectorAll('[aria-label="Leads by source"] li')].map((li) => li.getAttribute('aria-label'));
    expect(sources[0]).toBe('Property portal: 30 (71%)');
    const stages = [...el.querySelectorAll('[aria-label="Leads by status"] li')].map((li) => li.getAttribute('aria-label')?.split(':')[0]);
    expect(stages).toEqual(['New', 'Contacted', 'Qualified', 'Site Visit', 'Negotiation', 'Won', 'Lost']);
  });

  it('shows a readable error when the dashboard fails to load', async () => {
    const el = await render('error');
    expect(el.querySelector('[role="alert"]')?.textContent).toBeTruthy();
  });

  it('still shows API and database status', async () => {
    const el = await render();
    const done = TestBed.inject(SystemStatusStore).refresh();
    http.expectOne('/api/v1/health').flush({ status: 'error', details: { database: { status: 'down' } } }, { status: 503, statusText: 'Service Unavailable' });
    await done;
    await settle();
    expect(el.querySelector('[data-testid="api-status"]')?.textContent).toContain('Working');
    expect(el.querySelector('[data-testid="db-status"]')?.textContent).toContain('Not reachable');
  });
});
