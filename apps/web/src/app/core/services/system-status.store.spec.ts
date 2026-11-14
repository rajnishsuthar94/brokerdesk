import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { HealthResponse } from '@brokerdesk/shared-types';
import { SystemStatusStore } from './system-status.store';

const healthy: HealthResponse = {
  status: 'ok',
  info: { database: { status: 'up' } },
  error: {},
  details: { database: { status: 'up' } },
};

const dbDown: HealthResponse = {
  status: 'error',
  info: {},
  error: { database: { status: 'down' } },
  details: { database: { status: 'down' } },
};

describe('SystemStatusStore', () => {
  let store: SystemStatusStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(SystemStatusStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('starts idle with unknown service states', () => {
    expect(store.loadStatus()).toBe('idle');
    expect(store.apiState()).toBe('unknown');
    expect(store.databaseState()).toBe('unknown');
    expect(store.isHealthy()).toBe(false);
  });

  it('is loading while the request is in flight', () => {
    void store.refresh();
    expect(store.isLoading()).toBe(true);
    http.expectOne('/api/v1/health').flush(healthy);
  });

  it('reports healthy when API and database are up', async () => {
    const done = store.refresh();
    http.expectOne('/api/v1/health').flush(healthy);
    await done;

    expect(store.loadStatus()).toBe('loaded');
    expect(store.apiState()).toBe('up');
    expect(store.databaseState()).toBe('up');
    expect(store.isHealthy()).toBe(true);
    expect(store.checkedAt()).toBeInstanceOf(Date);
  });

  it('treats a 503 health body as "API up, database down" (not a network error)', async () => {
    const done = store.refresh();
    http.expectOne('/api/v1/health').flush(dbDown, { status: 503, statusText: 'Service Unavailable' });
    await done;

    expect(store.loadStatus()).toBe('loaded');
    expect(store.apiState()).toBe('up');
    expect(store.databaseState()).toBe('down');
    expect(store.isHealthy()).toBe(false);
    expect(store.error()).toBeNull();
  });

  it('reports both down with a friendly message when the server is unreachable', async () => {
    const done = store.refresh();
    http.expectOne('/api/v1/health').error(new ProgressEvent('error'), { status: 0 });
    await done;

    expect(store.loadStatus()).toBe('error');
    expect(store.apiState()).toBe('down');
    expect(store.databaseState()).toBe('down');
    expect(store.error()).toContain('Cannot reach the BrokerDesk server');
  });

  it('ignores a stale response that arrives after a newer refresh', async () => {
    const first = store.refresh();
    const second = store.refresh();
    const [stale, fresh] = http.match('/api/v1/health');

    fresh!.flush(healthy);
    await second;
    stale!.flush(dbDown, { status: 503, statusText: 'Service Unavailable' });
    await first;

    expect(store.databaseState()).toBe('up');
  });
});
