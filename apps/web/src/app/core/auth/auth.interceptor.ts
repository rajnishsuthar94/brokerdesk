import { HttpErrorResponse, type HttpInterceptorFn, type HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { ApiErrorCode } from '@brokerdesk/shared-types';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { apiErrorCode } from '../../shared/utils/http-error';
import { API_BASE_URL } from '../config/api.config';
import { AUTH_ENDPOINT_PATTERN } from './auth-api.service';
import { AuthStore } from './auth.store';

function withToken(req: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  return token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
}

/**
 * - Attaches the in-memory access token to BrokerDesk API calls (never to other hosts).
 * - On 401, refreshes once (shared with concurrent requests) and retries.
 * - If the refresh fails, ends the session and sends the user to login.
 * - On 403 NOT_A_MEMBER (removed from the agency), re-syncs the session.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const base = inject(API_BASE_URL);
  if (!req.url.startsWith(base) || AUTH_ENDPOINT_PATTERN.test(req.url)) return next(req);

  const store = inject(AuthStore);
  const sentToken = store.accessToken();

  return next(withToken(req, sentToken)).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse)) return throwError(() => error);

      if (error.status === 401 && sentToken) {
        return from(store.refreshAccessToken()).pipe(
          switchMap((fresh) => {
            if (!fresh) {
              void store.handleSessionExpired();
              return throwError(() => error);
            }
            return next(withToken(req, fresh));
          }),
        );
      }

      if (error.status === 403 && apiErrorCode(error) === ApiErrorCode.NOT_A_MEMBER) {
        // Access to this agency was removed; pick up the current memberships.
        void store.refreshAccessToken();
      }
      return throwError(() => error);
    }),
  );
};
