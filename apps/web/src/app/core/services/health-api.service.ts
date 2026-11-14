import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { HealthResponse } from '@brokerdesk/shared-types';
import { type Observable, catchError, of, throwError } from 'rxjs';
import { API_BASE_URL } from '../config/api.config';

function isHealthResponse(value: unknown): value is HealthResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    'details' in value &&
    typeof (value as { details: unknown }).details === 'object'
  );
}

/** HTTP access to the API health endpoints. No state, no UI logic. */
@Injectable({ providedIn: 'root' })
export class HealthApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  /**
   * Readiness check. The API answers 503 with a normal health body when a
   * dependency is down; that is a valid result, not a transport error, so it is
   * unwrapped here. Anything else (network failure, proxy error) is rethrown.
   */
  getReadiness(): Observable<HealthResponse> {
    return this.http.get<HealthResponse>(`${this.baseUrl}/health`).pipe(
      catchError((error: unknown) =>
        error instanceof HttpErrorResponse && error.status === 503 && isHealthResponse(error.error)
          ? of(error.error)
          : throwError(() => error),
      ),
    );
  }
}
