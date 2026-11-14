import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PublicEnquiryPage } from './public-enquiry-page';

describe('PublicEnquiryPage', () => {
  let http: HttpTestingController;

  const settle = async (): Promise<void> => {
    TestBed.tick();
    await new Promise((r) => setTimeout(r));
    TestBed.tick();
  };

  async function render(ref?: string): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [PublicEnquiryPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(PublicEnquiryPage);
    fixture.componentRef.setInput('slug', 'sabarmati-realty-3f9c2a1b');
    if (ref) fixture.componentRef.setInput('ref', ref);
    await settle();
    http.expectOne('/api/v1/public/enquiry/sabarmati-realty-3f9c2a1b').flush({
      agencyName: 'Sabarmati Realty',
      city: 'Ahmedabad',
      phone: '+917926501234',
    });
    await settle();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const type = (el: HTMLElement, id: string, value: string): void => {
    const input = el.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`#${id}`)!;
    input.value = value;
    input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input'));
  };

  afterEach(() => http.verify());

  it('shows the agency and requires consent before sending', async () => {
    const el = await render();
    expect(el.querySelector('[data-testid="agency-name"]')?.textContent).toContain('Sabarmati Realty');
    type(el, 'pe-name', 'Kiran Joshi');
    type(el, 'pe-phone', '98250 66001');
    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await settle();
    http.expectNone('/api/v1/public/enquiry/sabarmati-realty-3f9c2a1b');
    expect(el.textContent).toContain('Please tick the box so the agency can contact you');
  });

  it('sends a clean request with the channel from ?ref and shows a thank-you', async () => {
    const el = await render('qr');
    type(el, 'pe-name', '  Kiran Joshi ');
    type(el, 'pe-phone', '98250 66001');
    type(el, 'pe-bhk', '3');
    type(el, 'pe-budget', '85 L');
    type(el, 'pe-location', 'Bopal');
    const consent = el.querySelector<HTMLInputElement>('input[type=checkbox]')!;
    consent.click();
    await settle();
    expect(el.textContent).toContain('= ₹85,00,000');

    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await settle();
    const req = http.expectOne({ method: 'POST', url: '/api/v1/public/enquiry/sabarmati-realty-3f9c2a1b' });
    expect(req.request.body).toEqual({
      name: 'Kiran Joshi',
      phone: '98250 66001',
      listingType: 'SALE',
      propertyType: undefined,
      bhk: 3,
      budgetMax: 8500000,
      preferredLocation: 'Bopal',
      message: undefined,
      consent: true,
      channel: 'qr',
      website: undefined,
    });
    req.flush({ received: true });
    await settle();
    expect(el.querySelector('[data-testid="enquiry-thanks"]')?.textContent).toContain('Thank you, Kiran Joshi');
    expect(el.querySelector('a[href="tel:+917926501234"]')).not.toBeNull();
  });

  it('accepts international numbers for NRI buyers and ignores unknown channels', async () => {
    const el = await render('billboard');
    type(el, 'pe-name', 'Raj Patel');
    type(el, 'pe-phone', '+1 415 555 0199');
    el.querySelector<HTMLInputElement>('input[type=checkbox]')!.click();
    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await settle();
    const req = http.expectOne({ method: 'POST' });
    expect(req.request.body).toMatchObject({ phone: '+1 415 555 0199', channel: 'other' });
    req.flush({ received: true });
  });

  it('shows a friendly message when the form is unavailable', async () => {
    TestBed.configureTestingModule({ imports: [PublicEnquiryPage], providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(PublicEnquiryPage);
    fixture.componentRef.setInput('slug', 'gone-12345678');
    await settle();
    http.expectOne('/api/v1/public/enquiry/gone-12345678').flush(
      { statusCode: 404, message: 'This enquiry form is not available. Please contact the agency directly.' },
      { status: 404, statusText: 'Not Found' },
    );
    await settle();
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Enquiry form unavailable');
  });
});
