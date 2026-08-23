import { Component, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { NotificationService } from '@nori/core';
import { ClientsService } from '../clients.service';
import { Client, ClientFilters } from '../models/client.models';
import { PlanCode, SubscriptionStatus } from '../../shared/models/shared.models';
import { badgeClass, planLabel, subscriptionStatusLabel, subscriptionStatusTone } from '../../shared/utils/labels.util';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-clients-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './clients-list.html',
})
export class ClientsList implements OnDestroy {
  private readonly clientsService = inject(ClientsService);
  private readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly destroy$ = new Subject<void>();

  readonly planOptions: { value: PlanCode; label: string }[] = [
    { value: 'esencial', label: 'Esencial' },
    { value: 'crecimiento', label: 'Crecimiento' },
    { value: 'escala', label: 'Escala' },
    { value: 'enterprise', label: 'Enterprise' },
  ];

  readonly statusOptions: { value: SubscriptionStatus; label: string }[] = [
    { value: 'Trial', label: 'Prueba' },
    { value: 'Active', label: 'Activa' },
    { value: 'Suspended', label: 'Suspendida' },
    { value: 'Cancelled', label: 'Cancelada' },
  ];

  search = '';
  isActive: 'all' | 'true' | 'false' = 'all';
  planCode: PlanCode | 'all' = 'all';
  subscriptionStatus: SubscriptionStatus | 'all' = 'all';

  items: Client[] = [];
  totalCount = 0;
  totalPages = 0;
  pageNumber = 1;
  isLoading = false;
  errorMessage = '';

  readonly badgeClass = badgeClass;
  readonly planLabel = planLabel;
  readonly subscriptionStatusLabel = subscriptionStatusLabel;
  readonly subscriptionStatusTone = subscriptionStatusTone;

  constructor() {
    this.load();
  }

  applyFilters(): void {
    this.pageNumber = 1;
    this.load();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages || page === this.pageNumber) {
      return;
    }
    this.pageNumber = page;
    this.load();
  }

  openClient(client: Client): void {
    this.router.navigate(['/clients', client.id]);
  }

  newQuote(): void {
    this.router.navigate(['/quotes/new']);
  }

  newClient(): void {
    this.router.navigate(['/clients/new']);
  }

  private load(): void {
    this.isLoading = true;
    this.errorMessage = '';

    const filters: ClientFilters = {
      pageNumber: this.pageNumber,
      pageSize: PAGE_SIZE,
      search: this.search.trim() || undefined,
      isActive: this.isActive === 'all' ? undefined : this.isActive === 'true',
      planCode: this.planCode === 'all' ? undefined : this.planCode,
      subscriptionStatus: this.subscriptionStatus === 'all' ? undefined : this.subscriptionStatus,
    };

    this.clientsService
      .list(filters)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (page) => {
          this.items = page.items;
          this.totalCount = page.totalCount;
          this.totalPages = page.totalPages;
          this.pageNumber = page.pageNumber;
          this.isLoading = false;
        },
        error: (error) => {
          this.isLoading = false;
          this.errorMessage = 'No se pudieron cargar los clientes.';
          this.notificationService.apiError(error, this.errorMessage);
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
