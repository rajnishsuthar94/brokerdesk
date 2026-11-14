import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { type PartialMatchRouteSnapshot, type Route, Router, type UrlSegment, UrlTree, provideRouter } from '@angular/router';
import { agencyGuard, authGuard, guestGuard, safeReturnUrl } from './auth.guards';
import { AuthStore } from './auth.store';
import { fakeSession } from './testing';

describe('route guards', () => {
  let store: AuthStore;
  let http: HttpTestingController;
  const route: Route = {};
  const snapshot = {} as PartialMatchRouteSnapshot; // the guards do not read it
  const segments = (path: string): UrlSegment[] =>
    path.split('/').filter(Boolean).map((p) => ({ path: p, parameters: {}, parameterMap: null! }) as unknown as UrlSegment);

  const run = (guard: typeof authGuard, path = 'team'): boolean | UrlTree =>
    TestBed.runInInjectionContext(() => guard(route, segments(path), snapshot)) as boolean | UrlTree;
  const serialize = (r: boolean | UrlTree): string | boolean =>
    r instanceof UrlTree ? TestBed.inject(Router).serializeUrl(r) : r;

  async function signIn(session = fakeSession()): Promise<void> {
    const done = store.login({ email: 'r@example.com', password: 'Secret@123' });
    http.expectOne('/api/v1/auth/login').flush(session);
    await done;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    store = TestBed.inject(AuthStore);
    http = TestBed.inject(HttpTestingController);
  });

  it('authGuard sends signed-out users to login with a return URL', () => {
    expect(serialize(run(authGuard, 'team'))).toBe('/login?returnUrl=%2Fteam');
  });

  it('authGuard lets signed-in users through; guestGuard skips (never redirects) for them', async () => {
    expect(run(guestGuard)).toBe(true);
    await signIn();
    expect(run(authGuard)).toBe(true);
    expect(run(guestGuard)).toBe(false);
  });

  it('agencyGuard sends users without an agency to onboarding', async () => {
    await signIn(fakeSession({ memberships: [], activeAgencyId: null }));
    expect(serialize(run(agencyGuard))).toBe('/onboarding');
  });

  it.each([
    ['/team', '/team'],
    ['/invite?token=abc', '/invite?token=abc'],
    ['https://evil.example.com', '/dashboard'],
    ['//evil.example.com', '/dashboard'],
    ['/\\evil.example.com', '/dashboard'],
    ['javascript:alert(1)', '/dashboard'],
    [undefined, '/dashboard'],
  ])('safeReturnUrl(%s) → %s (no open redirects)', (input, expected) => {
    expect(safeReturnUrl(input)).toBe(expected);
  });
});
