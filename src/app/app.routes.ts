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
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
