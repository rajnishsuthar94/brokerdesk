import { inject } from '@angular/core';
import { type CanMatchFn, Router } from '@angular/router';
import { AuthStore } from './auth.store';

/*
 * Route guards improve UX only (what the user sees). They are NOT security:
 * every API endpoint enforces authentication, membership and roles itself.
 * The session is restored before routing starts (app initializer), so these
 * can read the store synchronously.
 */

/** Signed-in users only; others go to /login and come back afterwards. */
export const authGuard: CanMatchFn = (_route, segments) => {
  const store = inject(AuthStore);
  if (store.isAuthenticated()) return true;
  const path = '/' + segments.map((s) => s.path).join('/');
  return inject(Router).createUrlTree(['/login'], {
    queryParams: path !== '/' ? { returnUrl: path } : {},
  });
};

/**
 * Public pages (login, register…): only match for signed-out users.
 *
 * Returns `false` (never a UrlTree): this guard sits on a `''` route group that
 * the router tries for EVERY url, and a UrlTree from canMatch means "redirect",
 * not "skip" — redirecting here would loop forever. Signed-in users fall through
 * to the app routes, where /login and /register redirect to the dashboard.
 */
export const guestGuard: CanMatchFn = () => !inject(AuthStore).isAuthenticated();

/** Agency features: users without an agency are sent to create one. */
export const agencyGuard: CanMatchFn = () => {
  return inject(AuthStore).hasAgency() ? true : inject(Router).createUrlTree(['/onboarding']);
};

/** Only allow same-app relative paths as post-login redirects (prevents open redirects). */
export function safeReturnUrl(value: string | null | undefined): string {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : '/dashboard';
}
