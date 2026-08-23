import { Component, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { NotificationService } from '@nori/core';
import { QuotesService } from '../quotes.service';
import { Quote } from '../models/quote.models';
import { PlanCode, QuoteStatus } from '../../shared/models/shared.models';
import { badgeClass, planLabel, quoteStatusLabel, quoteStatusTone } from '../../shared/utils/labels.util';
import { formatMXN } from '../../shared/utils/format.util';

@Component({
  selector: 'app-quotes-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './quotes-list.html',
})
export class QuotesList implements OnDestroy {
  private readonly quotesService = inject(QuotesService);
  private readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly destroy$ = new Subject<void>();

  readonly planOptions: { value: PlanCode; label: string }[] = [
    { value: 'esencial', label: 'Esencial' },
    { value: 'crecimiento', label: 'Crecimiento' },
    { value: 'escala', label: 'Escala' },
    { value: 'enterprise', label: 'Enterprise' },
  ];

  readonly statusOptions: { value: QuoteStatus; label: string }[] = [
    { value: 'Draft', label: 'Borrador' },
    { value: 'Sent', label: 'Enviada' },
    { value: 'Accepted', label: 'Aceptada' },
    { value: 'Expired', label: 'Expirada' },
    { value: 'Superseded', label: 'Reemplazada' },
  ];

  status: QuoteStatus | 'all' = 'all';
  planCode: PlanCode | 'all' = 'all';

  quotes: Quote[] = [];
  isLoading = true;
  errorMessage = '';

  readonly badgeClass = badgeClass;
  readonly planLabel = planLabel;
  readonly quoteStatusLabel = quoteStatusLabel;
  readonly quoteStatusTone = quoteStatusTone;
  readonly formatMXN = formatMXN;

  constructor() {
    this.load();
  }

  applyFilters(): void {
    this.load();
  }

  newQuote(): void {
    this.router.navigate(['/quotes/new']);
  }

  openQuote(quote: Quote): void {
    this.router.navigate(['/quotes', quote.id]);
  }

  private load(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.quotesService
      .list({
        status: this.status === 'all' ? undefined : this.status,
        planCode: this.planCode === 'all' ? undefined : this.planCode,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (quotes) => {
          this.quotes = quotes;
          this.isLoading = false;
        },
        error: (error) => {
          this.isLoading = false;
          this.errorMessage = 'No se pudieron cargar las cotizaciones.';
          this.notificationService.apiError(error, this.errorMessage);
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
