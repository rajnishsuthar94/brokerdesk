import { TestBed } from '@angular/core/testing';
import type { PropertyInput } from '@brokerdesk/shared-types';
import { PhotoManager, type PhotoUpload } from './photo-manager';
import { PropertyForm } from './property-form';

const settle = (): Promise<void> => new Promise((r) => setTimeout(r));

describe('PropertyForm', () => {
  async function render(inputs: Record<string, unknown> = {}): Promise<{ el: HTMLElement; emitted: PropertyInput[] }> {
    TestBed.configureTestingModule({ imports: [PropertyForm] });
    const fixture = TestBed.createComponent(PropertyForm);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    const emitted: PropertyInput[] = [];
    fixture.componentInstance.save.subscribe((v) => emitted.push(v));
    await fixture.whenStable();
    return { el: fixture.nativeElement as HTMLElement, emitted };
  }
  const type = (el: HTMLElement, id: string, value: string): void => {
    const input = el.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)!;
    input.value = value;
    input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input'));
  };

  it('parses "85 L" prices and emits a clean PropertyInput (no assignee for agents)', async () => {
    const { el, emitted } = await render();
    type(el, 'pf-title', '3 BHK in Shela');
    type(el, 'pf-location', 'Shela');
    type(el, 'pf-price', '85 L');
    type(el, 'pf-bhk', '3');
    type(el, 'pf-owner-phone', '079-2650 1234');
    await settle();
    expect(el.textContent).toContain('= ₹85,00,000');
    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await settle();
    expect(emitted[0]).toMatchObject({
      title: '3 BHK in Shela', location: 'Shela', city: 'Ahmedabad', price: 8500000, bhk: 3,
      listingType: 'SALE', propertyType: 'APARTMENT', ownerPhone: '079-2650 1234', projectName: null, parking: 0,
    });
    expect(emitted[0]).not.toHaveProperty('assignedUserId');
  });

  it('requires title, location and a valid price', async () => {
    const { el, emitted } = await render();
    type(el, 'pf-price', 'lots');
    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await settle();
    expect(emitted).toHaveLength(0);
    expect(el.textContent).toContain('Enter an amount like');
  });

  it('labels rent as per month', async () => {
    const { el } = await render();
    const rent = Array.from(el.querySelectorAll('label')).find((l) => l.textContent?.trim() === 'For rent')!;
    rent.click();
    type(el, 'pf-price', '28000');
    await settle();
    expect(el.textContent).toContain('Rent per month');
    expect(el.textContent).toContain('= ₹28,000 per month');
  });
});

describe('PhotoManager', () => {
  async function render(images: { id: string; url: string; displayOrder: number }[] = []): Promise<{ el: HTMLElement; uploads: PhotoUpload[] }> {
    TestBed.configureTestingModule({ imports: [PhotoManager] });
    const fixture = TestBed.createComponent(PhotoManager);
    fixture.componentRef.setInput('images', images);
    fixture.componentRef.setInput('editable', true);
    const uploads: PhotoUpload[] = [];
    fixture.componentInstance.upload.subscribe((u) => uploads.push(u));
    await fixture.whenStable();
    return { el: fixture.nativeElement as HTMLElement, uploads };
  }
  const choose = (el: HTMLElement, files: File[]): void => {
    const input = el.querySelector<HTMLInputElement>('[data-testid="photo-input"]')!;
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    input.dispatchEvent(new Event('change'));
  };

  it('emits valid photos and marks the first photo as the cover', async () => {
    const { el, uploads } = await render([
      { id: 'a', url: '/a.webp', displayOrder: 0 },
      { id: 'b', url: '/b.webp', displayOrder: 1 },
    ]);
    expect(el.querySelectorAll('[data-testid="photo"]')[0]?.textContent).toContain('Cover');
    choose(el, [new File(['x'], 'flat.jpg', { type: 'image/jpeg' })]);
    expect(uploads).toHaveLength(1);
  });

  it('rejects non-photos (e.g. PDFs, SVG) before uploading', async () => {
    const { el, uploads } = await render();
    choose(el, [new File(['%PDF'], 'brochure.pdf', { type: 'application/pdf' })]);
    choose(el, [new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' })]);
    await settle();
    expect(uploads).toHaveLength(0);
    expect(el.textContent).toContain('is not a JPG, PNG or WebP photo');
  });

  it('enforces the 20-photo limit', async () => {
    const images = Array.from({ length: 19 }, (_, i) => ({ id: `i${i}`, url: `/${i}.webp`, displayOrder: i }));
    const { el, uploads } = await render(images);
    choose(el, [new File(['x'], 'a.jpg', { type: 'image/jpeg' }), new File(['y'], 'b.jpg', { type: 'image/jpeg' })]);
    await settle();
    expect(uploads).toHaveLength(0);
    expect(el.textContent).toContain('You can add 1 more photo.');
  });
});
