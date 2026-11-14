import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { MessageTemplateView, SiteVisitView } from '@brokerdesk/shared-types';
import { WhatsappTemplates } from './whatsapp-templates';

const TEMPLATES: MessageTemplateView[] = [
  { id: 't1', title: 'Site visit confirmation', category: 'SITE_VISIT', updatedAt: '', message: 'Hi {{name}}, visit to {{property}}, {{location}} on {{visit_time}}. — {{agent}}' },
  { id: 't2', title: 'Share a property', category: 'PROPERTY_SHARE', updatedAt: '', message: 'Hi {{name}}, price {{price}}' },
];
const VISIT: SiteVisitView = {
  id: 'v1', lead: { id: 'l1', name: 'Amit Mehta', phone: '+919825012345', status: 'SITE_VISIT' },
  property: { id: 'p1', title: 'Applewoods 3 BHK', location: 'Shela', coverImageUrl: null }, assignedUser: null,
  scheduledAt: '2030-11-22T05:30:00.000Z', status: 'SCHEDULED', feedback: null, createdAt: '',
};

describe('WhatsappTemplates', () => {
  let http: HttpTestingController;

  const settle = async (): Promise<void> => {
    TestBed.tick();
    await new Promise((r) => setTimeout(r));
    TestBed.tick();
  };

  async function render(templates: MessageTemplateView[], visits: SiteVisitView[]): Promise<HTMLElement> {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(WhatsappTemplates);
    fixture.componentRef.setInput('lead', { id: 'l1', name: 'Amit Mehta', phone: '+919825012345' });
    await settle();
    http.expectOne('/api/v1/message-templates').flush(templates);
    http.expectOne('/api/v1/leads/l1/site-visits').flush(visits);
    await settle();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => http.verify());

  it('fills the template from the lead and the next site visit and opens WhatsApp click-to-chat', async () => {
    const el = await render(TEMPLATES, [VISIT]);
    const preview = el.querySelector('[data-testid="wa-preview"]')!.textContent!;
    expect(preview).toContain('Hi Amit, visit to Applewoods 3 BHK, Shela on Fri, 22 Nov, 11:00 AM.');
    const href = el.querySelector<HTMLAnchorElement>('[data-testid="wa-open"]')!.href;
    expect(href.startsWith('https://wa.me/919825012345?text=')).toBe(true);
    expect(decodeURIComponent(href.split('text=')[1]!)).toContain('Applewoods 3 BHK');
  });

  it('warns about placeholders it cannot fill', async () => {
    const el = await render(TEMPLATES, []);
    const select = el.querySelector<HTMLSelectElement>('[data-testid="wa-template-select"]')!;
    select.value = 't2';
    select.dispatchEvent(new Event('change'));
    await settle();
    expect(el.textContent).toContain('Not filled in: property price');
    expect(el.querySelector('[data-testid="wa-preview"]')!.textContent).toBe('Hi Amit, price');
  });

  it('points to the templates page when there are none', async () => {
    const el = await render([], []);
    expect(el.textContent).toContain('No templates yet.');
    expect(el.querySelector('[data-testid="wa-open"]')).toBeNull();
  });
});
