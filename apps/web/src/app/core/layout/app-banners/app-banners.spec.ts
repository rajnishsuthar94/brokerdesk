import { TestBed } from '@angular/core/testing';
import { AppBanners } from './app-banners';

describe('AppBanners', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows an offline notice while the browser is offline, and hides it when back online', async () => {
    const onLine = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);
    const fixture = TestBed.createComponent(AppBanners);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="offline-banner"]')).toBeNull();

    onLine.mockReturnValue(false);
    window.dispatchEvent(new Event('offline'));
    await fixture.whenStable();
    expect(el.querySelector('[data-testid="offline-banner"]')?.textContent).toContain("You're offline");

    onLine.mockReturnValue(true);
    window.dispatchEvent(new Event('online'));
    await fixture.whenStable();
    expect(el.querySelector('[data-testid="offline-banner"]')).toBeNull();
  });

  it('works without a service worker (development, tests): no update banner', async () => {
    const fixture = TestBed.createComponent(AppBanners);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="update-banner"]')).toBeNull();
  });
});
