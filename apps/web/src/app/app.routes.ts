import type { Routes } from '@angular/router';
import { agencyGuard, authGuard, guestGuard } from './core/auth/auth.guards';

/**
 * Top-level routes. Every page is lazy-loaded.
 * Guards only shape navigation; the API enforces all access rules.
 */
export const routes: Routes = [
  // Public pages for signed-out users.
  {
    path: '',
    canMatch: [guestGuard],
    loadComponent: () => import('./core/layout/auth-layout/auth-layout').then((m) => m.AuthLayout),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'login' },
      { path: 'login', title: 'Log in · BrokerDesk', loadComponent: () => import('./features/auth/pages/login-page').then((m) => m.LoginPage) },
      { path: 'register', title: 'Create account · BrokerDesk', loadComponent: () => import('./features/auth/pages/register-page').then((m) => m.RegisterPage) },
      { path: 'forgot-password', title: 'Forgot password · BrokerDesk', loadComponent: () => import('./features/auth/pages/forgot-password-page').then((m) => m.ForgotPasswordPage) },
    ],
  },
  // Emailed/shared link pages that work whether or not the user is signed in.
  // Explicit paths (not a '' group) so they can never swallow other URLs.
  {
    path: 'reset-password',
    loadComponent: () => import('./core/layout/auth-layout/auth-layout').then((m) => m.AuthLayout),
    children: [
      { path: '', title: 'Reset password · BrokerDesk', loadComponent: () => import('./features/auth/pages/reset-password-page').then((m) => m.ResetPasswordPage) },
    ],
  },
  {
    path: 'invite',
    loadComponent: () => import('./core/layout/auth-layout/auth-layout').then((m) => m.AuthLayout),
    children: [
      { path: '', title: 'Invitation · BrokerDesk', loadComponent: () => import('./features/auth/pages/accept-invite-page').then((m) => m.AcceptInvitePage) },
    ],
  },
  // Public enquiry form (shared by agencies as a link / QR code). No login, no app chrome.
  {
    path: 'enquire/:slug',
    title: 'Property enquiry',
    loadComponent: () => import('./features/enquiry/pages/public-enquiry-page').then((m) => m.PublicEnquiryPage),
  },
  // The signed-in app.
  {
    path: '',
    canMatch: [authGuard],
    loadComponent: () => import('./core/layout/shell/shell').then((m) => m.Shell),
    children: [
      // Signed-in users opening public entry pages go to the app.
      { path: 'login', redirectTo: 'dashboard' },
      { path: 'register', redirectTo: 'dashboard' },
      { path: 'forgot-password', redirectTo: 'dashboard' },
      { path: 'onboarding', title: 'Set up your agency · BrokerDesk', loadComponent: () => import('./features/onboarding/pages/create-agency-page').then((m) => m.CreateAgencyPage) },
      { path: 'settings', title: 'Settings · BrokerDesk', loadComponent: () => import('./features/settings/pages/settings-page').then((m) => m.SettingsPage) },
      {
        path: '',
        canMatch: [agencyGuard],
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
          { path: 'dashboard', title: 'Dashboard · BrokerDesk', loadComponent: () => import('./features/dashboard/pages/dashboard-page').then((m) => m.DashboardPage) },
          { path: 'leads', loadChildren: () => import('./features/leads/leads.routes').then((m) => m.LEADS_ROUTES) },
          { path: 'properties', loadChildren: () => import('./features/properties/properties.routes').then((m) => m.PROPERTIES_ROUTES) },
          { path: 'follow-ups', loadChildren: () => import('./features/activities/activities.routes').then((m) => m.FOLLOW_UPS_ROUTES) },
          { path: 'site-visits', loadChildren: () => import('./features/activities/activities.routes').then((m) => m.SITE_VISITS_ROUTES) },
          { path: 'matching', title: 'Matching · BrokerDesk', loadComponent: () => import('./features/matching/pages/matching-page').then((m) => m.MatchingPage) },
          { path: 'reports', title: 'Reports · BrokerDesk', loadComponent: () => import('./features/reports/pages/reports-page').then((m) => m.ReportsPage) },
          { path: 'plan', title: 'Plan & usage · BrokerDesk', loadComponent: () => import('./features/subscription/pages/plan-page').then((m) => m.PlanPage) },
          { path: 'templates', title: 'WhatsApp templates · BrokerDesk', loadComponent: () => import('./features/templates/pages/templates-page').then((m) => m.TemplatesPage) },
          { path: 'team', title: 'Team · BrokerDesk', loadComponent: () => import('./features/team/pages/team-page').then((m) => m.TeamPage) },
          { path: '**', title: 'Not found · BrokerDesk', loadComponent: () => import('./features/not-found/not-found-page').then((m) => m.NotFoundPage) },
        ],
      },
    ],
  },
  // Signed out and no public page matched: go to login.
  { path: '**', redirectTo: 'login' },
];
