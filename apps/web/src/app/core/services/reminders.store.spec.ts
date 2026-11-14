import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { RemindersStore } from './reminders.store';

describe('RemindersStore', () => {
  let http: HttpTestingController;
  let store: RemindersStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(RemindersStore);
  });

  afterEach(() => {
    store.stop();
    http.verify();
  });

  it('totals overdue, due-today and today’s visits', async () => {
    const done = store.refresh();
    http.expectOne('/api/v1/dashboard/reminders').flush({ overdueFollowUps: 2, followUpsDueToday: 3, siteVisitsToday: 1 });
    await done;
    expect(store.total()).toBe(6);
    expect(store.hasOverdue()).toBe(true);
  });

  it('keeps the last counts when a check fails, and clears them on stop', async () => {
    const first = store.refresh();
    http.expectOne('/api/v1/dashboard/reminders').flush({ overdueFollowUps: 0, followUpsDueToday: 1, siteVisitsToday: 0 });
    await first;
    const second = store.refresh();
    http.expectOne('/api/v1/dashboard/reminders').flush({}, { status: 500, statusText: 'Server Error' });
    await second;
    expect(store.total()).toBe(1);
    store.stop();
    expect(store.counts()).toBeNull();
  });
});
