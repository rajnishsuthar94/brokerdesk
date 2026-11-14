import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import type { TeamMember } from '@brokerdesk/shared-types';
import { of } from 'rxjs';
import { AuthStore } from '../auth/auth.store';
import { API_BASE_URL } from '../config/api.config';

/**
 * Read-only list of the active agency's members, for assignee pickers in leads,
 * properties, follow-ups… Reloads automatically when the agency changes.
 * (Team management itself lives in features/team with its own store.)
 */
@Injectable({ providedIn: 'root' })
export class TeamDirectoryStore {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);
  private readonly auth = inject(AuthStore);

  private readonly resource = rxResource({
    params: () => this.auth.activeAgencyId(),
    stream: ({ params: agencyId }) =>
      agencyId ? this.http.get<TeamMember[]>(`${this.base}/agencies/current/members`) : of([] as TeamMember[]),
  });

  readonly members = computed(() =>
    [...(this.resource.value() ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
  );
  readonly isLoading = this.resource.isLoading;

  reload(): void {
    this.resource.reload();
  }
}
