import type { Routes } from '@angular/router';
import { LeadsListStore } from './store/leads-list.store';

/** Lazy-loaded Leads feature. The list store lives as long as the feature's routes. */
export const LEADS_ROUTES: Routes = [
  {
    path: '',
    providers: [LeadsListStore],
    children: [
      { path: '', title: 'Leads · BrokerDesk', loadComponent: () => import('./pages/leads-list-page').then((m) => m.LeadsListPage) },
      { path: 'new', title: 'Add lead · BrokerDesk', loadComponent: () => import('./pages/lead-form-page').then((m) => m.LeadFormPage) },
      { path: 'capture', title: 'Get leads online · BrokerDesk', loadComponent: () => import('./pages/lead-capture-page').then((m) => m.LeadCapturePage) },
      { path: 'import', title: 'Import leads · BrokerDesk', loadComponent: () => import('./pages/leads-import-page').then((m) => m.LeadsImportPage) },
      { path: ':id', title: 'Lead · BrokerDesk', loadComponent: () => import('./pages/lead-detail-page').then((m) => m.LeadDetailPage) },
      { path: ':id/edit', title: 'Edit lead · BrokerDesk', loadComponent: () => import('./pages/lead-form-page').then((m) => m.LeadFormPage) },
    ],
  },
];
