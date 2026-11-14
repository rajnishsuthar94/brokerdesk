import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { MemberRole, PendingInvitation, TeamMember } from '@brokerdesk/shared-types';
import { AuthStore } from '../../../core/auth/auth.store';
import { fakeSession } from '../../../core/auth/testing';
import { TeamStore } from './team.store';

const member = (id: string, name: string, role: MemberRole): TeamMember => ({
  memberId: id,
  userId: `u-${id}`,
  name,
  email: `${name.toLowerCase()}@example.com`,
  phone: null,
  role,
  joinedAt: '2026-11-01T00:00:00.000Z',
});

const invitation = (id: string, email: string): PendingInvitation => ({
  id,
  email,
  role: 'AGENT',
  invitedByName: 'Ramesh',
  expiresAt: '2026-11-21T00:00:00.000Z',
  createdAt: '2026-11-14T00:00:00.000Z',
});

describe('TeamStore', () => {
  let store: TeamStore;
  let http: HttpTestingController;

  async function signInAs(role: MemberRole): Promise<void> {
    const auth = TestBed.inject(AuthStore);
    const done = auth.login({ email: 'me@example.com', password: 'Secret@123' });
    http.expectOne('/api/v1/auth/login').flush(
      fakeSession({ memberships: [{ memberId: 'me', agencyId: 'agency-a', agencyName: 'A', role }] }),
    );
    await done;
  }

  async function load(members: TeamMember[], invitations: PendingInvitation[] | null): Promise<void> {
    const done = store.load();
    http.expectOne('/api/v1/agencies/current/members').flush(members);
    if (invitations) http.expectOne('/api/v1/agencies/current/invitations').flush(invitations);
    await done;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), TeamStore],
    });
    store = TestBed.inject(TeamStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads members sorted by role then name, plus invitations for managers', async () => {
    await signInAs('OWNER');
    await load([member('3', 'Zara', 'AGENT'), member('me', 'Ramesh', 'OWNER'), member('2', 'Amit', 'AGENT')], [invitation('i1', 'new@example.com')]);

    expect(store.status()).toBe('loaded');
    expect(store.members().map((m) => m.name)).toEqual(['Ramesh', 'Amit', 'Zara']);
    expect(store.invitations()).toHaveLength(1);
  });

  it('agents load members only (no invitations request)', async () => {
    await signInAs('AGENT');
    await load([member('me', 'Kavya', 'AGENT')], null);
    expect(store.invitations()).toEqual([]);
  });

  it('canEdit mirrors the shared policy and never allows editing yourself', async () => {
    await signInAs('ADMIN');
    await load([member('me', 'Me', 'ADMIN'), member('o', 'Owner', 'OWNER'), member('a', 'Agent', 'AGENT'), member('b', 'Other', 'ADMIN')], []);
    const byName = (n: string): TeamMember => store.members().find((m) => m.name === n)!;
    expect(store.canEdit(byName('Me'))).toBe(false);
    expect(store.canEdit(byName('Owner'))).toBe(false);
    expect(store.canEdit(byName('Other'))).toBe(false);
    expect(store.canEdit(byName('Agent'))).toBe(true);
  });

  it('updates state immutably only after the server confirms', async () => {
    await signInAs('OWNER');
    await load([member('me', 'Me', 'OWNER'), member('a', 'Agent', 'AGENT')], []);
    const before = store.members();

    const change = store.changeRole('a', 'ADMIN');
    expect(store.isBusy('a')).toBe(true);
    expect(store.members().find((m) => m.memberId === 'a')?.role).toBe('AGENT');
    http.expectOne({ method: 'PATCH', url: '/api/v1/agencies/current/members/a' }).flush(member('a', 'Agent', 'ADMIN'));
    await change;

    expect(store.isBusy('a')).toBe(false);
    expect(store.members().find((m) => m.memberId === 'a')?.role).toBe('ADMIN');
    expect(before.find((m) => m.memberId === 'a')?.role).toBe('AGENT'); // old array untouched
  });

  it('keeps state unchanged and rethrows when the server refuses', async () => {
    await signInAs('OWNER');
    await load([member('me', 'Me', 'OWNER'), member('a', 'Agent', 'AGENT')], []);
    const remove = store.removeMember('a');
    http.expectOne({ method: 'DELETE', url: '/api/v1/agencies/current/members/a' }).flush(
      { message: 'nope' },
      { status: 403, statusText: 'Forbidden' },
    );
    await expect(remove).rejects.toMatchObject({ status: 403 });
    expect(store.members()).toHaveLength(2);
    expect(store.isBusy('a')).toBe(false);
  });

  it('a re-invite replaces the pending invitation for the same email', async () => {
    await signInAs('OWNER');
    await load([member('me', 'Me', 'OWNER')], [invitation('old', 'x@example.com')]);
    const done = store.invite('x@example.com', 'ADMIN');
    http.expectOne({ method: 'POST', url: '/api/v1/agencies/current/invitations' }).flush({
      invitation: { ...invitation('new', 'x@example.com'), role: 'ADMIN' },
      inviteUrl: 'http://localhost:4200/invite?token=t',
    });
    await done;
    expect(store.invitations().map((i) => i.id)).toEqual(['new']);
  });
});
