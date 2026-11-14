import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import type { HealthResponse } from '@brokerdesk/shared-types';
import { firstValueFrom } from 'rxjs';
import { HealthApiService } from './health-api.service';

export type LoadStatus = 'idle' | 'loading' | 'loaded' | 'error';
export type ServiceState = 'unknown' | 'up' | 'degraded' | 'down';

interface SystemStatusState {
  readonly loadStatus: LoadStatus;
  readonly health: HealthResponse | null;
  readonly error: string | null;
  readonly checkedAt: Date | null;
}

const initialState: SystemStatusState = {
  loadStatus: 'idle',
  health: null,
  error: null,
  checkedAt: null,
};

/**
 * Signal-based store for API/database availability.
 *
 * Pattern used by every feature store:
 * - one private writable `state` signal, replaced immutably (never mutated);
 * - readonly slices and `computed()` selectors exposed publicly;
 * - async actions call an API service; components never call HTTP directly.
 */
@Injectable({ providedIn: 'root' })
export class SystemStatusStore {
  private readonly api = inject(HealthApiService);
  private readonly state = signal<SystemStatusState>(initialState);
  /** Guards against out-of-order responses when refresh() is called repeatedly. */
  private requestSeq = 0;

  readonly loadStatus = computed(() => this.state().loadStatus);
  readonly error = computed(() => this.state().error);
  readonly checkedAt = computed(() => this.state().checkedAt);
  readonly isLoading = computed(() => this.state().loadStatus === 'loading');

  /** The API process answered (any health body means it is running). */
  readonly apiState = computed<ServiceState>(() => {
    const { loadStatus, health } = this.state();
    if (health) return 'up';
    return loadStatus === 'error' ? 'down' : 'unknown';
  });

  readonly databaseState = computed<ServiceState>(() => {
    const { loadStatus, health } = this.state();
    if (!health) return loadStatus === 'error' ? 'down' : 'unknown';
    return health.details['database']?.status ?? 'down';
  });

  readonly isHealthy = computed(
    () => this.apiState() === 'up' && this.databaseState() === 'up',
  );

  async refresh(): Promise<void> {
    const seq = ++this.requestSeq;
    this.state.update((s) => ({ ...s, loadStatus: 'loading', error: null }));
    try {
      const health = await firstValueFrom(this.api.getReadiness());
      if (seq !== this.requestSeq) return;
      this.state.set({ loadStatus: 'loaded', health, error: null, checkedAt: new Date() });
    } catch (error: unknown) {
      if (seq !== this.requestSeq) return;
      this.state.set({
        loadStatus: 'error',
        health: null,
        error: describeError(error),
        checkedAt: new Date(),
      });
    }
  }
}

function describeError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    return error.status === 0
      ? 'Cannot reach the BrokerDesk server. Check your internet connection.'
      : `The server responded with an error (${error.status}).`;
  }
  return 'Something went wrong while checking the server.';
}
