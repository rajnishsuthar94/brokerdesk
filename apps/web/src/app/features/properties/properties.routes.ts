import type { Routes } from '@angular/router';
import { PropertiesListStore } from './store/properties-list.store';

export const PROPERTIES_ROUTES: Routes = [
  {
    path: '',
    providers: [PropertiesListStore],
    children: [
      { path: '', title: 'Properties · BrokerDesk', loadComponent: () => import('./pages/properties-list-page').then((m) => m.PropertiesListPage) },
      { path: 'new', title: 'Add property · BrokerDesk', loadComponent: () => import('./pages/property-form-page').then((m) => m.PropertyFormPage) },
      { path: ':id', title: 'Property · BrokerDesk', loadComponent: () => import('./pages/property-detail-page').then((m) => m.PropertyDetailPage) },
      { path: ':id/edit', title: 'Edit property · BrokerDesk', loadComponent: () => import('./pages/property-form-page').then((m) => m.PropertyFormPage) },
    ],
  },
];
