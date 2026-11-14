import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { FollowUpView } from '@brokerdesk/shared-types';
import { FollowUpItem } from './follow-up-item';

const PENDING: FollowUpView = {
  id: 'f1',
  lead: { id: 'l1', name: 'Amit Mehta', phone: '+919825012345', status: 'CONTACTED' },
  assignedUser: { id: 'u1', name: 'Ramesh' },
  dueAt: new Date(Date.now() - 3_600_000).toISOString(),
  status: 'PENDING',
  notes: 'Share brochure',
  completedAt: null,
  createdAt: new Date().toISOString(),
};

describe('FollowUpItem', () => {
  let http: HttpTestingController;

  const settle = async (): Promise<void> => {
    TestBed.tick();
    await new Promise((r) => setTimeout(r));
    TestBed.tick();
  };

  async function render(item: FollowUpView = PENDING): Promise<{ el: HTMLElement; changed: number[] }> {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(FollowUpItem);
    fixture.componentRef.setInput('item', item);
    const changed: number[] = [];
    fixture.componentInstance.changed.subscribe(() => changed.push(1));
    await fixture.whenStable();
    return { el: fixture.nativeElement as HTMLElement, changed };
  }

  const button = (el: HTMLElement, text: string): HTMLButtonElement =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!;

  afterEach(() => http.verify());

  it('flags an overdue follow-up with a label and icon (not colour alone), with WhatsApp click-to-chat', async () => {
    const { el } = await render();
    expect(el.textContent).toContain('Overdue');
    expect(el.querySelector('svg')).not.toBeNull();
    expect(el.querySelector<HTMLAnchorElement>('a[href^="https://wa.me/"]')?.href).toContain('wa.me/919825012345');
  });

  it('marks done with the outcome and schedules the next follow-up in one step', async () => {
    const { el, changed } = await render();
    button(el, 'Mark done').click();
    await settle();

    const outcome = el.querySelector<HTMLTextAreaElement>('textarea')!;
    outcome.value = 'Wants Sunday visit';
    outcome.dispatchEvent(new Event('input'));
    el.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    await settle();
    const when = el.querySelector<HTMLInputElement>('input[type="datetime-local"]')!;
    when.value = '2026-11-20T17:30';
    when.dispatchEvent(new Event('input'));
    await settle();

    el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await settle();
    const req = http.expectOne('/api/v1/follow-ups/f1/complete');
    expect(req.request.body).toEqual({ outcome: 'Wants Sunday visit', nextDueAt: '2026-11-20T12:00:00.000Z' });
    req.flush({ ...PENDING, status: 'COMPLETED', completedAt: new Date().toISOString() });
    await settle();
    http.match('/api/v1/dashboard/reminders').forEach((r) => r.flush({ overdueFollowUps: 0, followUpsDueToday: 0, siteVisitsToday: 0 }));
    await settle();
    expect(changed).toHaveLength(1);
  });

  it('does not submit "schedule next" without a date', async () => {
    const { el } = await render();
    button(el, 'Mark done').click();
    await settle();
    el.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    await settle();
    el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await settle();
    http.expectNone('/api/v1/follow-ups/f1/complete');
    expect(el.textContent).toContain('Choose a date and time.');
  });

  it('shows no actions for a completed follow-up', async () => {
    const { el } = await render({ ...PENDING, status: 'COMPLETED', completedAt: new Date().toISOString() });
    expect(el.textContent).toContain('Done');
    expect(button(el, 'Mark done')).toBeUndefined();
  });
});
