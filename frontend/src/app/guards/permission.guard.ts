import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export function permissionGuard(...keys: string[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    if (!auth.isLoggedIn) return router.createUrlTree(['/login']);
    if (keys.some((key) => auth.can(key))) return true;
    if (auth.can('transfers.view') && !keys.includes('transfers.view')) {
      return router.createUrlTree(['/']);
    }
    if (
      (auth.can('users.manage') || auth.can('stats.view')) &&
      !keys.includes('users.manage') &&
      !keys.includes('stats.view')
    ) {
      return router.createUrlTree(['/admin']);
    }
    return router.createUrlTree(['/login']);
  };
}
