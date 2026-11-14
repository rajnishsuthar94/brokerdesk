import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, type TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { LeadView, Paginated } from '@brokerdesk/shared-types';
import { LeadsListStore } from './leads-list.store';

const lead = (id: string, name: string): LeadView => ({
  id,
  name,
  phone: '+919825012345',
  email: null,
  source: 'OTHER',
  budgetMin: null,
  budgetMax: 8500000,
  preferredLocation: 'Shela',
  bhk: 3,
  propertyType: 'APARTMENT',
  listingType: 'SALE',
  areaMin: null,
  areaMax: null,
  areaUnit: null,
  status: 'NEW',
  priority: 'MEDIUM',
  nextFollowUpAt: null,
  notes: null,
  assignedUser: null,
  createdAt: '2026-11-14T00:00:00.000Z',
  updatedAt: '2026-11-14T00:00:00.000Z',
});

const page = (items: LeadView[], total = items.length, p = 1): Paginated<LeadView> => ({ items, total, page: p, pageSize: 20 });

describe('LeadsListStore', () => {
  let store: LeadsListStore;
  let http: HttpTestingController;

  /** Lets resources start requests / publish responses (they work asynchronously). */
  const settle = async (): Promise<void> => {
    TestBed.tick();
    await new Promise((r) => setTimeout(r));
    TestBed.tick();
  };

  const nextRequest = async (): Promise<TestRequest> => {
    await settle();
    return http.expectOne((r) => r.url === '/api/v1/leads');
  };

  /** Serves the first page and waits until the store shows it. */
  const loadFirst = async (body: Paginated<LeadView>): Promise<void> => {
    (await nextRequest()).flush(body);
    await settle();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), LeadsListStore],
    });
    store = TestBed.inject(LeadsListStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the first page sorted newest first', async () => {
    const req = await nextRequest();
    expect(req.request.params.toString()).toBe('sort=createdAt&order=desc&page=1&pageSize=20');
    req.flush(page([lead('1', 'Amit')], 1));
    await settle();
    expect(store.items().map((l) => l.name)).toEqual(['Amit']);
    expect(store.total()).toBe(1);
  });

  it('sends filters as query params (arrays repeated, empty values dropped)', async () => {
    await loadFirst(page([]));
    store.setFilters({ status: ['NEW', 'WON'], followUp: 'overdue', assignedTo: 'me', listingType: null });
    store.setSearch('  mehta ');
    const req = await nextRequest();
    const p = req.request.params;
    expect(p.getAll('status')).toEqual(['NEW', 'WON']);
    expect(p.get('followUp')).toBe('overdue');
    expect(p.get('assignedTo')).toBe('me');
    expect(p.get('search')).toBe('mehta');
    expect(p.has('listingType')).toBe(false);
    req.flush(page([]));
  });

  it('goes back to page 1 whenever filters change (linkedSignal)', async () => {
    await loadFirst(page([lead('1', 'A')], 45));
    store.setPage(3);
    const p3 = await nextRequest();
    expect(p3.request.params.get('page')).toBe('3');
    p3.flush(page([lead('41', 'Z')], 45, 3));
    await settle();

    store.toggleStatus('QUALIFIED');
    expect(store.page()).toBe(1);
    const p1 = await nextRequest();
    expect(p1.request.params.get('page')).toBe('1');
    expect(p1.request.params.get('status')).toBe('QUALIFIED');
    p1.flush(page([]));
  });

  it('clamps page numbers to the available range', async () => {
    await loadFirst(page([lead('1', 'A')], 45)); // 3 pages
    store.setPage(99);
    expect(store.page()).toBe(3);
    store.setPage(-2);
    expect(store.page()).toBe(1);
    await settle();
    http.match(() => true).forEach((r) => r.flush(page([])));
  });

  it('keeps showing the previous results while the next page loads (no flicker)', async () => {
    await loadFirst(page([lead('1', 'Amit')], 30));
    store.setPage(2);
    const req = await nextRequest();
    expect(store.isLoading()).toBe(true);
    expect(store.items().map((l) => l.name)).toEqual(['Amit']);
    req.flush(page([lead('2', 'Bina')], 30, 2));
    await settle();
    expect(store.items().map((l) => l.name)).toEqual(['Bina']);
  });

  it('counts active filters and clears them but keeps the sort', async () => {
    await loadFirst(page([]));
    store.setFilters({ status: ['NEW'], source: ['WALK_IN'], followUp: 'today', sort: 'name', order: 'asc' });
    expect(store.activeFilterCount()).toBe(3);
    expect(store.hasSearchOrFilters()).toBe(true);
    store.clearFilters();
    expect(store.activeFilterCount()).toBe(0);
    expect(store.filters().sort).toBe('name');
    await settle();
    http.match(() => true).forEach((r) => r.flush(page([])));
  });

  it('exposes a friendly error', async () => {
    (await nextRequest()).flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    await settle();
    expect(store.error()).toBe('Could not load leads.');
  });
});
