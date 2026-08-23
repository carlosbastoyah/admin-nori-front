import { Injectable } from '@angular/core';
import {
  CanActivate,
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  UrlTree,
  Router
} from '@angular/router';
import { Observable } from 'rxjs';
import { AuthService } from '../services/auth/auth.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly router: Router
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean | UrlTree> | Promise<boolean | UrlTree> | boolean | UrlTree {
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/login'], {
        queryParams: { returnUrl: state.url }
      });
      return false;
    }

    const denyRoles = route.data['denyRoles'] as string[] | undefined;
    if (denyRoles?.length && this.authService.hasRole(denyRoles)) {
      this.router.navigate(['/dashboard']);
      return false;
    }

    const module = route.data['module'] as string | undefined;
    const action = (route.data['action'] as string | undefined) ?? 'view';
    if (module && !this.authService.hasPermission(module, action)) {
      this.router.navigate(['/dashboard']);
      return false;
    }

    return true;
  }
}
