import { Component, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, switchMap } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { NotificationService } from '@nori/core';
import { ClientsService } from '../clients.service';
import { QuotesService } from '../../quotes/quotes.service';
import { Client, ClientSubscription } from '../models/client.models';
import { Quote } from '../../quotes/models/quote.models';
import { badgeClass, planLabel, quoteStatusLabel, quoteStatusTone, subscriptionStatusLabel, subscriptionStatusTone } from '../../shared/utils/labels.util';
import { formatMXN } from '../../shared/utils/format.util';

@Component({
  selector: 'app-client-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './client-detail.html',
})
export class ClientDetail implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly clientsService = inject(ClientsService);
  private readonly quotesService = inject(QuotesService);
  private readonly notificationService = inject(NotificationService);
  private readonly destroy$ = new Subject<void>();

  client: Client | null = null;
  subscription: ClientSubscription | null = null;
  quotes: Quote[] = [];
  isLoading = true;
  isLoadingSubscription = false;
  notFound = false;

  readonly badgeClass = badgeClass;
  readonly planLabel = planLabel;
  readonly subscriptionStatusLabel = subscriptionStatusLabel;
  readonly subscriptionStatusTone = subscriptionStatusTone;
  readonly quoteStatusLabel = quoteStatusLabel;
  readonly quoteStatusTone = quoteStatusTone;
  readonly formatMXN = formatMXN;

  constructor() {
    this.route.paramMap
      .pipe(
        switchMap((params) => {
          const id = params.get('id') ?? '';
          this.isLoading = true;
          this.notFound = false;
          return this.clientsService.getById(id);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (client) => {
          this.client = client;
          this.isLoading = false;
          this.loadSubscription(client.id);
          this.loadQuotes(client.id);
        },
        error: (error) => {
          this.isLoading = false;
          this.notFound = true;
          this.notificationService.apiError(error, 'No se pudo cargar el cliente.');
        },
      });
  }

  newQuote(): void {
    if (!this.client) return;
    this.router.navigate(['/quotes/new'], { queryParams: { clientId: this.client.id } });
  }

  openQuote(quote: Quote): void {
    this.router.navigate(['/quotes', quote.id]);
  }

  private loadSubscription(clientId: string): void {
    this.isLoadingSubscription = true;
    this.clientsService
      .getSubscription(clientId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (subscription) => {
          this.subscription = subscription;
          this.isLoadingSubscription = false;
        },
        error: () => {
          this.subscription = null;
          this.isLoadingSubscription = false;
        },
      });
  }

  private loadQuotes(clientId: string): void {
    this.quotesService
      .list({ clientId })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (quotes) => (this.quotes = quotes),
        error: () => (this.quotes = []),
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
