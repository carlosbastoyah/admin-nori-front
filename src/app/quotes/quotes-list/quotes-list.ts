import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NotificationService } from '@nori/core';
import { QuotesService } from '../quotes.service';
import { Quote } from '../models/quote.models';
import { PlanCode, QuoteStatus } from '../../shared/models/shared.models';
import { badgeClass, planLabel, quoteStatusLabel, quoteStatusTone } from '../../shared/utils/labels.util';
import { formatMXN } from '../../shared/utils/format.util';
import { downloadQuotePdf, openQuotePdf, quoteFolio } from '../quote-pdf/quote-pdf';

/** Days before the end of its validity a quote is flagged as about to expire. */
const EXPIRING_DAYS = 7;

function isOpen(quote: Quote): boolean {
  return quote.status === 'Draft' || quote.status === 'Sent';
}

function daysUntil(value: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${value.slice(0, 10)}T00:00:00`).getTime() - today.getTime()) / 86_400_000);
}

@Component({
  selector: 'app-quotes-list',
  standalone: true,
  imports: [DatePipe, FormsModule],
  templateUrl: './quotes-list.html',
})
export class QuotesList {
  private readonly quotesService = inject(QuotesService);
  private readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly planOptions: { value: PlanCode; label: string }[] = [
    { value: 'esencial', label: 'Esencial' },
    { value: 'crecimiento', label: 'Crecimiento' },
    { value: 'escala', label: 'Escala' },
    { value: 'enterprise', label: 'Enterprise' },
  ];

  readonly statusOptions: { value: QuoteStatus | 'open' | 'all'; label: string }[] = [
    { value: 'all', label: 'Todas' },
    { value: 'open', label: 'Abiertas' },
    { value: 'Draft', label: 'Borrador' },
    { value: 'Sent', label: 'Enviada' },
    { value: 'Accepted', label: 'Aceptada' },
    { value: 'Expired', label: 'Expirada' },
    { value: 'Superseded', label: 'Reemplazada' },
  ];

  readonly status = signal<QuoteStatus | 'open' | 'all'>('all');
  readonly planCode = signal<PlanCode | 'all'>('all');
  readonly search = signal('');

  readonly quotes = signal<Quote[]>([]);
  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  /** Quote with an action in flight (PDF or delete). */
  readonly busyId = signal<string | null>(null);

  readonly badgeClass = badgeClass;
  readonly planLabel = planLabel;
  readonly quoteStatusLabel = quoteStatusLabel;
  readonly quoteStatusTone = quoteStatusTone;
  readonly formatMXN = formatMXN;
  readonly quoteFolio = quoteFolio;

  readonly visible = computed(() => {
    const status = this.status();
    const plan = this.planCode();
    const term = this.search().trim().toLowerCase();
    return this.quotes().filter((q) => {
      if (status === 'open' && !isOpen(q)) return false;
      if (status !== 'all' && status !== 'open' && q.status !== status) return false;
      if (plan !== 'all' && q.planCode !== plan) return false;
      if (term && !`${q.clientName ?? ''} ${q.prospectName ?? ''} ${quoteFolio(q)}`.toLowerCase().includes(term)) return false;
      return true;
    });
  });

  // Summary over every quote, not the filtered ones.
  readonly openQuotes = computed(() => this.quotes().filter(isOpen));
  readonly openValue = computed(() => this.openQuotes().reduce((sum, q) => sum + q.subtotal, 0));
  readonly accepted = computed(() => this.quotes().filter((q) => q.status === 'Accepted'));
  readonly acceptedValue = computed(() => this.accepted().reduce((sum, q) => sum + q.subtotal, 0));
  /** Accepted over the quotes that reached an outcome (accepted, expired or replaced). */
  readonly winRate = computed(() => {
    const decided = this.quotes().filter((q) => q.status === 'Accepted' || q.status === 'Expired' || q.status === 'Superseded').length;
    return decided ? Math.round((this.accepted().length / decided) * 100) : null;
  });
  readonly expiringSoon = computed(() => this.openQuotes().filter((q) => q.validUntil && daysUntil(q.validUntil) <= EXPIRING_DAYS).length);

  constructor() {
    this.load();
  }

  newQuote(): void {
    this.router.navigate(['/quotes/new']);
  }

  openQuote(quote: Quote): void {
    this.router.navigate(['/quotes', quote.id]);
  }

  canEdit(quote: Quote): boolean {
    return isOpen(quote);
  }

  canDelete(quote: Quote): boolean {
    return quote.status !== 'Accepted';
  }

  /** "Vence en 3 días", "Venció hace 2 días"; null when the quote has no end or is no longer open. */
  validity(quote: Quote): { text: string; tone: 'danger' | 'warn' | 'muted' } | null {
    if (!quote.validUntil || !isOpen(quote)) return null;
    const days = daysUntil(quote.validUntil);
    if (days < 0) return { text: `Venció hace ${-days} día${days === -1 ? '' : 's'}`, tone: 'danger' };
    if (days === 0) return { text: 'Vence hoy', tone: 'danger' };
    if (days <= EXPIRING_DAYS) return { text: `Vence en ${days} día${days === 1 ? '' : 's'}`, tone: 'warn' };
    return { text: `Vence en ${days} días`, tone: 'muted' };
  }

  edit(quote: Quote, event: Event): void {
    event.stopPropagation();
    this.router.navigate(['/quotes', quote.id, 'edit']);
  }

  async viewPdf(quote: Quote, event: Event): Promise<void> {
    event.stopPropagation();
    this.busyId.set(quote.id);
    try {
      await openQuotePdf(quote);
    } catch {
      this.notificationService.error('No se pudo abrir el PDF.');
    } finally {
      this.busyId.set(null);
    }
  }

  async downloadPdf(quote: Quote, event: Event): Promise<void> {
    event.stopPropagation();
    this.busyId.set(quote.id);
    try {
      await downloadQuotePdf(quote);
    } catch {
      this.notificationService.error('No se pudo generar el PDF.');
    } finally {
      this.busyId.set(null);
    }
  }

  remove(quote: Quote, event: Event): void {
    event.stopPropagation();
    const who = quote.clientName || quote.prospectName || 'este cliente';
    if (!confirm(`¿Eliminar la cotización ${quoteFolio(quote)} de ${who}? Esta acción no se puede deshacer.`)) return;
    this.busyId.set(quote.id);
    this.quotesService
      .delete(quote.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busyId.set(null);
          this.quotes.update((list) => list.filter((q) => q.id !== quote.id));
          this.notificationService.success(`Cotización ${quoteFolio(quote)} eliminada.`, 'Listo');
        },
        error: (error) => {
          this.busyId.set(null);
          this.notificationService.apiError(error, 'No se pudo eliminar la cotización.');
        },
      });
  }

  load(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    // Every quote at once: filters run here, so the summary always covers all of them.
    this.quotesService
      .list({})
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (quotes) => {
          this.quotes.set([...quotes].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
          this.isLoading.set(false);
        },
        error: (error) => {
          this.isLoading.set(false);
          this.errorMessage.set('No se pudieron cargar las cotizaciones.');
          this.notificationService.apiError(error, this.errorMessage());
        },
      });
  }
}
