import { Routes } from '@angular/router';
import { AuthGuard, NoAuthGuard } from '@nori/core';
import { Login } from './auth/login/login';
import { Layout } from './layout/layout';
import { Dashboard } from './dashboard/dashboard';

export const routes: Routes = [
  { path: 'login', component: Login, canActivate: [NoAuthGuard] },
  {
    path: '',
    component: Layout,
    canActivate: [AuthGuard],
    children: [
      { path: 'dashboard', component: Dashboard },
      {
        path: 'clients',
        loadComponent: () => import('./clients/clients-list/clients-list').then((m) => m.ClientsList),
      },
      {
        path: 'clients/new',
        loadComponent: () => import('./clients/client-new/client-new').then((m) => m.ClientNew),
      },
      {
        path: 'clients/:id',
        loadComponent: () => import('./clients/client-detail/client-detail').then((m) => m.ClientDetail),
      },
      {
        path: 'catalog',
        loadComponent: () => import('./catalog/catalog-page/catalog-page').then((m) => m.CatalogPage),
      },
      {
        path: 'quotes',
        loadComponent: () => import('./quotes/quotes-list/quotes-list').then((m) => m.QuotesList),
      },
      {
        path: 'quotes/new',
        loadComponent: () => import('./quotes/quote-editor/quote-editor').then((m) => m.QuoteEditor),
      },
      {
        path: 'quotes/:id',
        loadComponent: () => import('./quotes/quote-detail/quote-detail').then((m) => m.QuoteDetail),
      },
      {
        path: 'releases',
        loadComponent: () => import('./releases/releases-list/releases-list').then((m) => m.ReleasesList),
      },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
