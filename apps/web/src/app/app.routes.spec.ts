import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { SessionResponse } from '@brokerdesk/shared-types';
import { routes } from './app.routes';
import { AuthStore } from './core/auth/auth.store';
import { fakeSession } from './core/auth/testing';

/**
 * Drives the REAL route table through the router. Guard unit tests alone missed
 * an infinite redirect loop (a canMatch UrlTree on a '' group), so navigation
 * outcomes are asserted end to end here.
 */
describe('app routes', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter(routes)],
    });
    http = TestBed.inject(HttpTestingController);
  });

  async function signIn(session: SessionResponse = fakeSession()): Promise<void> {
    const done = TestBed.inject(AuthStore).login({ email: 'r@example.com', password: 'Secret@123' });
    http.expectOne('/api/v1/auth/login').flush(session);
    await done;
  }

  /** Navigates and returns the final URL (fails fast instead of hanging on a redirect loop). */
  async function go(url: string): Promise<string> {
    const harness = await RouterTestingHarness.create();
    await Promise.race([
      harness.navigateByUrl(url),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`Navigation to ${url} did not settle`)), 2000)),
    ]);
    // Ignore background requests made by rendered pages (e.g. health checks).
    http.match(() => true);
    return TestBed.inject(Router).url;
  }

  describe('signed out', () => {
    it.each([
      ['/', '/login'],
      ['/login', '/login'],
      ['/register', '/register'],
      ['/dashboard', '/login?returnUrl=%2Fdashboard'],
      ['/team', '/login?returnUrl=%2Fteam'],
      ['/leads/new', '/login?returnUrl=%2Fleads%2Fnew'],
      ['/properties', '/login?returnUrl=%2Fproperties'],
      ['/no-such-page', '/login?returnUrl=%2Fno-such-page'],
      ['/reset-password?token=abc', '/reset-password?token=abc'],
      ['/invite?token=abc', '/invite?token=abc'],
      ['/enquire/sabarmati-realty-3f9c2a1b', '/enquire/sabarmati-realty-3f9c2a1b'],
    ])('%s → %s', async (from, to) => {
      expect(await go(from)).toBe(to);
    });
  });

  describe('signed in with an agency', () => {
    beforeEach(() => signIn());

    it.each([
      ['/', '/dashboard'],
      ['/login', '/dashboard'],
      ['/register', '/dashboard'],
      ['/dashboard', '/dashboard'],
      ['/team', '/team'],
      ['/leads', '/leads'],
      ['/leads/new', '/leads/new'],
      ['/leads/import', '/leads/import'],
      ['/leads/capture', '/leads/capture'],
      ['/properties', '/properties'],
      ['/properties/new', '/properties/new'],
      ['/matching', '/matching'],
      ['/enquire/sabarmati-realty-3f9c2a1b', '/enquire/sabarmati-realty-3f9c2a1b'],
      ['/settings', '/settings'],
      ['/invite?token=abc', '/invite?token=abc'],
      ['/no-such-page', '/no-such-page'], // in-app 404 page
    ])('%s → %s', async (from, to) => {
      expect(await go(from)).toBe(to);
    });
  });

  describe('signed in without an agency', () => {
    beforeEach(() => signIn(fakeSession({ memberships: [], activeAgencyId: null })));

    it.each([
      ['/', '/onboarding'],
      ['/dashboard', '/onboarding'],
      ['/team', '/onboarding'],
      ['/leads', '/onboarding'],
      ['/properties', '/onboarding'],
      ['/login', '/onboarding'],
      ['/settings', '/settings'],
      ['/onboarding', '/onboarding'],
    ])('%s → %s', async (from, to) => {
      expect(await go(from)).toBe(to);
    });
  });
});
