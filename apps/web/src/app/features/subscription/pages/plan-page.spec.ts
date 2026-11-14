import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { SubscriptionSummary } from '@brokerdesk/shared-types';
import { AuthStore } from '../../../core/auth/auth.store';
import { PlanPage } from './plan-page';

const SUMMARY: SubscriptionSummary = {
  plan: 'FREE', displayName: 'Free', status: 'ACTIVE', startsAt: '2026-11-01T00:00:00.000Z', expiresAt: null, active: true,
  limits: { leads: 25, users: 1 }, usage: { leads: 21, members: 1, pendingInvitations: 0 },
  plans: [
    { plan: 'FREE', displayName: 'Free', monthlyPricePaise: 0, leadLimit: 25, userLimit: 1 },
    { plan: 'STARTER', displayName: 'Starter', monthlyPricePaise: 49900, leadLimit: 250, userLimit: 1 },
    { plan: 'PROFESSIONAL', displayName: 'Professional', monthlyPricePaise: 99900, leadLimit: 1000, userLimit: 3 },
    { plan: 'BUSINESS', displayName: 'Business', monthlyPricePaise: 199900, leadLimit: null, userLimit: 5 },
  ],
  salesContact: 'sales@brokerdesk.in', lastUpgradeRequestAt: null,
};

describe('PlanPage', () => {
  let http: HttpTestingController;

  const settle = async (): Promise<void> => {
    TestBed.tick();
    await new Promise((r) => setTimeout(r));
    TestBed.tick();
  };

  async function render(summary: SubscriptionSummary, canManage: boolean): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: AuthStore, useValue: { activeAgencyId: () => 'a1', canManageTeam: () => canManage } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(PlanPage);
    await settle();
    http.expectOne('/api/v1/subscription').flush(summary);
    await settle();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => http.verify());

  it('shows usage meters with an "almost full" label and INR prices', async () => {
    const el = await render(SUMMARY, true);
    const meters = el.querySelectorAll('[data-testid="usage-meter"]');
    expect(meters[0]!.textContent).toContain('21 of 25');
    expect(meters[0]!.textContent).toContain('Almost full');
    expect(meters[1]!.textContent).toContain('Limit reached');
    const cards = [...el.querySelectorAll('[data-testid="plan-card"]')].map((c) => c.textContent!.replace(/\s+/g, ' '));
    expect(cards[1]).toContain('₹499 / month');
    expect(cards[3]).toContain('Unlimited leads');
  });

  it('sends an upgrade request (no payment) with a note', async () => {
    const el = await render(SUMMARY, true);
    const buttons = [...el.querySelectorAll('button')].filter((b) => b.textContent?.includes('Request upgrade'));
    expect(buttons).toHaveLength(3);
    buttons[1]!.click();
    await settle();
    expect(el.textContent).toContain("doesn't take online payments");
    const note = el.querySelector<HTMLTextAreaElement>('#upgrade-note')!;
    note.value = 'Need 3 seats';
    note.dispatchEvent(new Event('input'));
    el.querySelector<HTMLFormElement>('form[aria-label="Upgrade request"]')!.dispatchEvent(new Event('submit'));
    await settle();
    const req = http.expectOne('/api/v1/subscription/upgrade-request');
    expect(req.request.body).toEqual({ plan: 'PROFESSIONAL', note: 'Need 3 seats' });
    req.flush({ ok: true });
    await settle();
    http.expectOne('/api/v1/subscription').flush({ ...SUMMARY, lastUpgradeRequestAt: new Date().toISOString() });
    await settle();
    expect(el.querySelector('[data-testid="last-request"]')).not.toBeNull();
  });

  it('agents see the plan but cannot request changes; an ended plan says Free limits apply', async () => {
    const el = await render({ ...SUMMARY, plan: 'PROFESSIONAL', displayName: 'Professional', active: false, status: 'EXPIRED' }, false);
    expect(el.textContent).toContain('Free limits apply until renewed');
    expect([...el.querySelectorAll('button')].some((b) => /Request upgrade|Renew/.test(b.textContent ?? ''))).toBe(false);
    expect(el.textContent).toContain('Ask your agency owner or admin');
  });
});
