import { Component, HostListener, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService } from '@nori/core';

type SidebarIcon = 'home' | 'users' | 'shield' | 'settings' | 'building' | 'layers' | 'receipt';

interface SidebarNavItem {
  label: string;
  icon: SidebarIcon;
  /** Undefined until the real endpoint/route for this section is provided. */
  route?: string;
}

const ICON_PATHS: Record<SidebarIcon, string> = {
  home: 'M3 12l9-9 9 9M5 10v10a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h0a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V10',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09c.67 0 1.25-.39 1.51-1 .27-.61.14-1.32-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06c.5.47 1.21.6 1.82.33.61-.26 1-.84 1-1.51V3a2 2 0 1 1 4 0v.09c0 .67.39 1.25 1 1.51.61.27 1.32.14 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06c-.47.5-.6 1.21-.33 1.82.26.61.84 1 1.51 1H21a2 2 0 1 1 0 4h-.09c-.67 0-1.25.39-1.51 1z',
  building: 'M4 21V7a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v14 M12 21V3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v18 M4 21h16 M7 10h1 M7 14h1 M15 7h1 M15 11h1 M15 15h1',
  layers: 'M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5',
  receipt: 'M6 2h9l5 5v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z M15 2v5h5 M8 13h8 M8 17h8 M8 9h3',
};

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './layout.html',
})
export class Layout {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly currentUser = this.authService.getCurrentUser();

  // Usuarios / Roles y permisos / Configuración stay disabled ("Pronto")
  // until their backend endpoints are provided.
  readonly navItems: SidebarNavItem[] = [
    { label: 'Dashboard', icon: 'home', route: '/dashboard' },
    { label: 'Clientes', icon: 'building', route: '/clients' },
    { label: 'Catálogo', icon: 'layers', route: '/catalog' },
    { label: 'Cotizaciones', icon: 'receipt', route: '/quotes' },
    // { label: 'Usuarios', icon: 'users' },
    // { label: 'Roles y permisos', icon: 'shield' },
    // { label: 'Configuración', icon: 'settings' },
  ];

  sidebarOpen = true;
  pageTitle = 'Dashboard';

  constructor() {
    this.updatePageTitle();
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed()
      )
      .subscribe(() => this.updatePageTitle());
  }

  iconPath(icon: SidebarIcon): string {
    return ICON_PATHS[icon];
  }

  private updatePageTitle(): void {
    const match = this.navItems.find((item) => item.route && this.router.url.startsWith(item.route));
    this.pageTitle = match?.label ?? 'Dashboard';
  }

  get userInitial(): string {
    const name = this.currentUser?.name;
    return name?.charAt(0).toUpperCase() ?? 'U';
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    if (window.innerWidth < 900 && this.sidebarOpen) {
      this.sidebarOpen = false;
    }
  }

  logout(): void {
    this.authService.logout().subscribe();
  }
}
