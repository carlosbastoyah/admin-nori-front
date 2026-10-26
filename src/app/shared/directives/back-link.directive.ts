import { Directive, inject, input } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';

/**
 * "Back" link that returns to the page the admin came from (a client, the quotes list…).
 * Without in-app history — a reload or a shared link — it goes to `appBackLink` instead.
 */
@Directive({
  selector: 'a[appBackLink]',
  standalone: true,
  host: {
    '[attr.href]': 'fallback()',
    '(click)': 'onClick($event)',
  },
})
export class BackLink {
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  readonly fallback = input.required<string>({ alias: 'appBackLink' });

  onClick(event: MouseEvent): void {
    // Let the browser open it in a new tab/window.
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (this.router.lastSuccessfulNavigation?.previousNavigation) {
      this.location.back();
    } else {
      this.router.navigateByUrl(this.fallback());
    }
  }
}
