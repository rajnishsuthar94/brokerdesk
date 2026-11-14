import { InjectionToken } from '@angular/core';

/**
 * Base URL of the BrokerDesk REST API.
 *
 * Relative by design: in development the Angular dev server proxies `/api` to the
 * NestJS API (proxy.conf.json); in production nginx serves the app and proxies
 * `/api` on the same origin. Same-origin keeps refresh-token cookies SameSite=Strict
 * and avoids CORS entirely. No secrets ever belong in frontend configuration.
 */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => '/api/v1',
});
