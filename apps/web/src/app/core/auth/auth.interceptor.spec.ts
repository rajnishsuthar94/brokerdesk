import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { authInterceptor } from './auth.interceptor';
import { AuthStore } from './auth.store';
import { fakeSession } from './testing';

describe('authInterceptor', () => {
  let http: HttpTestingController;
  let client: HttpClient;
  let store: AuthStore;

  async function signIn(token = 'token-1'): Promise<void> {
    const done = store.login({ email: 'r@example.com', password: 'Secret@123' });
    http.expectOne('/api/v1/auth/login').flush(fakeSession({ accessToken: token }));
    await done;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient);
    store = TestBed.inject(AuthStore);
  });

  afterEach(() => http.verify());

  it('attaches the bearer token to API calls only', async () => {
    await signIn();
    void firstValueFrom(client.get('/api/v1/agencies/current'));
    expect(http.expectOne('/api/v1/agencies/current').request.headers.get('Authorization')).toBe('Bearer token-1');

    void firstValueFrom(client.get('https://maps.example.com/tiles'));
    expect(http.expectOne('https://maps.example.com/tiles').request.headers.has('Authorization')).toBe(false);
  });

  it('never attaches the token to login/refresh calls', async () => {
    await signIn();
    void store.refreshAccessToken();
    const req = http.expectOne('/api/v1/auth/refresh');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush(fakeSession());
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    await signIn('expired');
    const result = firstValueFrom(client.get<{ ok: boolean }>('/api/v1/agencies/current'));

    http.expectOne('/api/v1/agencies/current').flush({}, { status: 401, statusText: 'Unauthorized' });
    await Promise.resolve();
    http.expectOne('/api/v1/auth/refresh').flush(fakeSession({ accessToken: 'fresh' }));
    await new Promise((r) => setTimeout(r));
    const retry = http.expectOne('/api/v1/agencies/current');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer fresh');
    retry.flush({ ok: true });

    expect(await result).toEqual({ ok: true });
  });

  it('ends the session and goes to /login when the refresh fails', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await signIn('expired');
    const result = firstValueFrom(client.get('/api/v1/agencies/current'));

    http.expectOne('/api/v1/agencies/current').flush({}, { status: 401, statusText: 'Unauthorized' });
    await Promise.resolve();
    http.expectOne('/api/v1/auth/refresh').flush({}, { status: 401, statusText: 'Unauthorized' });

    await expect(result).rejects.toMatchObject({ status: 401 });
    expect(store.isAuthenticated()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/login'], expect.anything());
  });
});
