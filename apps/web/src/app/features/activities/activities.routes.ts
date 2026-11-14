import type { Routes } from '@angular/router';

export const FOLLOW_UPS_ROUTES: Routes = [
  { path: '', title: 'Follow-ups · BrokerDesk', loadComponent: () => import('./pages/follow-ups-page').then((m) => m.FollowUpsPage) },
];

export const SITE_VISITS_ROUTES: Routes = [
  { path: '', title: 'Site visits · BrokerDesk', loadComponent: () => import('./pages/site-visits-page').then((m) => m.SiteVisitsPage) },
  { path: 'new', title: 'Schedule visit · BrokerDesk', loadComponent: () => import('./pages/schedule-visit-page').then((m) => m.ScheduleVisitPage) },
];
