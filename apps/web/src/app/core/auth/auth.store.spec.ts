import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthStore } from './auth.store';
import { fakeSession } from './testing';

describe('AuthStore', () => {
  let store: AuthStore;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    store = TestBed.inject(AuthStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('starts unknown and becomes anonymous when there is no refresh cookie', async () => {
    expect(store.status()).toBe('unknown');
    const done = store.restoreSession();
    http.expectOne('/api/v1/auth/refresh').flush({ message: 'x' }, { status: 401, statusText: 'Unauthorized' });
    await done;
    expect(store.status()).toBe('anonymous');
    expect(store.accessToken()).toBeNull();
  });

  it('restores a session, sending the CSRF header and the last-used agency', async () => {
    localStorage.setItem('bd.lastAgencyId', 'agency-a');
    const done = store.restoreSession();
    const req = http.expectOne('/api/v1/auth/refresh');
    expect(req.request.headers.get('X-BrokerDesk-Client')).toBe('web');
    expect(req.request.body).toEqual({ agencyId: 'agency-a' });
    req.flush(fakeSession());
    await done;

    expect(store.isAuthenticated()).toBe(true);
    expect(store.accessToken()).toBe('token-1');
    expect(store.activeMembership()?.agencyName).toBe('Sabarmati Realty');
    expect(store.role()).toBe('OWNER');
    expect(store.canManageTeam()).toBe(true);
  });

  it('never persists the access token in storage', async () => {
    const done = store.login({ email: 'ramesh@example.com', password: 'Secret@123' });
    http.expectOne('/api/v1/auth/login').flush(fakeSession());
    await done;
    const stored = JSON.stringify({ ...localStorage });
    expect(stored).not.toContain('token-1');
  });

  it('shares one refresh request between concurrent callers (single flight)', async () => {
    const a = store.refreshAccessToken();
    const b = store.refreshAccessToken();
    http.expectOne('/api/v1/auth/refresh').flush(fakeSession({ accessToken: 'fresh' }));
    expect(await a).toBe('fresh');
    expect(await b).toBe('fresh');
  });

  it('retries once on a REFRESH_RACE (another tab rotated the cookie)', async () => {
    vi.useFakeTimers();
    try {
      const result = store.refreshAccessToken();
      http.expectOne('/api/v1/auth/refresh').flush(
        { statusCode: 401, message: 'race', code: 'REFRESH_RACE' },
        { status: 401, statusText: 'Unauthorized' },
      );
      await vi.advanceTimersByTimeAsync(300);
      http.expectOne('/api/v1/auth/refresh').flush(fakeSession({ accessToken: 'after-race' }));
      expect(await result).toBe('after-race');
    } finally {
      vi.useRealTimers();
    }
  });

  it('agents cannot manage the team (display only; the API enforces it)', async () => {
    const done = store.login({ email: 'a@example.com', password: 'Secret@123' });
    http.expectOne('/api/v1/auth/login').flush(
      fakeSession({ memberships: [{ memberId: 'm', agencyId: 'agency-a', agencyName: 'A', role: 'AGENT' }] }),
    );
    await done;
    expect(store.canManageTeam()).toBe(false);
  });

  it('logout clears state even if the request fails, then goes to /login', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const login = store.login({ email: 'r@example.com', password: 'Secret@123' });
    http.expectOne('/api/v1/auth/login').flush(fakeSession());
    await login;

    const done = store.logout();
    http.expectOne('/api/v1/auth/logout').flush(null, { status: 500, statusText: 'Server Error' });
    await done;
    expect(store.isAuthenticated()).toBe(false);
    expect(store.accessToken()).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });
});
