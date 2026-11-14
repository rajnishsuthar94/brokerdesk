import { TestBed } from '@angular/core/testing';
import type { LeadInput, LeadView } from '@brokerdesk/shared-types';
import { LeadForm } from './lead-form';

describe('LeadForm', () => {
  async function render(inputs: Record<string, unknown> = {}): Promise<{ el: HTMLElement; emitted: LeadInput[] }> {
    TestBed.configureTestingModule({ imports: [LeadForm] });
    const fixture = TestBed.createComponent(LeadForm);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    const emitted: LeadInput[] = [];
    fixture.componentInstance.save.subscribe((v) => emitted.push(v));
    await fixture.whenStable();
    return { el: fixture.nativeElement as HTMLElement, emitted };
  }

  const type = (el: HTMLElement, id: string, value: string): void => {
    const input = el.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`#${id}`)!;
    input.value = value;
    input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input'));
  };
  const submit = async (el: HTMLElement): Promise<void> => {
    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await new Promise((r) => setTimeout(r));
  };

  it('parses lakh/crore budgets and converts the follow-up from IST', async () => {
    const { el, emitted } = await render();
    type(el, 'lf-name', 'Amit Mehta');
    type(el, 'lf-phone', '98250 12345');
    type(el, 'lf-bmin', '75 L');
    type(el, 'lf-bmax', '1.2 Cr');
    type(el, 'lf-followup', '2026-11-20T17:30');
    await new Promise((r) => setTimeout(r));
    expect(el.textContent).toContain('= ₹1,20,00,000');

    await submit(el);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      name: 'Amit Mehta',
      phone: '98250 12345',
      budgetMin: 7500000,
      budgetMax: 12000000,
      nextFollowUpAt: '2026-11-20T12:00:00.000Z', // 17:30 IST
      listingType: 'SALE',
      email: null,
    });
    // Agents (canAssign=false) never send an assignee.
    expect(emitted[0]).not.toHaveProperty('assignedUserId');
  });

  it('blocks submit for invalid phone, bad amounts and min > max', async () => {
    const { el, emitted } = await render();
    type(el, 'lf-name', 'Amit');
    type(el, 'lf-phone', '12345');
    type(el, 'lf-bmin', 'lots');
    await submit(el);
    expect(emitted).toHaveLength(0);
    expect(el.textContent).toContain('Enter a 10-digit mobile number');
    expect(el.textContent).toContain('Enter an amount like');

    type(el, 'lf-phone', '+1 415 555 0199');
    type(el, 'lf-bmin', '90 L');
    type(el, 'lf-bmax', '80 L');
    await submit(el);
    expect(emitted).toHaveLength(0);
    expect(el.textContent).toContain('must be more than');
  });

  it('pre-fills from an existing lead and lets managers set the assignee', async () => {
    const existing = {
      id: 'l1', name: 'Priya Iyer', phone: '+919426055667', email: null, source: 'WHATSAPP', budgetMin: 20000, budgetMax: 30000,
      preferredLocation: 'Prahlad Nagar', bhk: 2, propertyType: 'APARTMENT', listingType: 'RENT', areaMin: null, areaMax: null,
      areaUnit: null, status: 'CONTACTED', priority: 'HIGH', nextFollowUpAt: '2026-11-20T12:00:00.000Z', notes: 'Pets',
      assignedUser: { id: 'u2', name: 'Kavya' }, createdAt: '', updatedAt: '',
    } satisfies LeadView;
    const members = [{ memberId: 'm2', userId: 'u2', name: 'Kavya', email: 'k@x.in', phone: null, role: 'AGENT', joinedAt: '' }];
    const { el, emitted } = await render({ lead: existing, members, canAssign: true });

    // Follow-ups of an existing lead are managed on its page, not in the edit form.
    expect(el.querySelector('#lf-followup')).toBeNull();
    type(el, 'lf-assignee', '');
    await submit(el);
    expect(emitted[0]).toMatchObject({ name: 'Priya Iyer', listingType: 'RENT', budgetMax: 30000, notes: 'Pets', assignedUserId: null });
    expect(emitted[0]).not.toHaveProperty('nextFollowUpAt');
  });
});
