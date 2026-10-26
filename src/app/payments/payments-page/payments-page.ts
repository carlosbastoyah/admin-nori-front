import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { NotificationService } from '@nori/core';
import { BillingOverviewService, PrefacturaRow } from '../../billing-overview/billing-overview.service';
import { availableYears, isOpen, keyOf, monthKey, monthShortLabel, sum } from '../../billing-overview/billing-metrics';
import { ClientBillingService } from '../../clients/client-billing.service';
import { Prefactura } from '../../clients/models/billing.models';
import { Modal } from '../../shared/components/modal/modal';
import { formatMXN } from '../../shared/utils/format.util';
import { PAYMENT_METHODS, badgeClass, paymentMethodLabel, prefacturaStatusLabel, prefacturaStatusTone } from '../../shared/utils/labels.util';
import { openPrefacturaPdf, shortDate } from '../../clients/prefactura/prefactura-pdf';

type StatusFilter = 'all' | 'open' | 'overdue' | 'Draft' | 'Issued' | 'Paid' | 'Cancelled';
type View = 'prefacturas' | 'pending';

const STATUS_FILTERS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'open', label: 'Por cobrar' },
  { value: 'overdue', label: 'Vencidas' },
  { value: 'Draft', label: 'Borradores' },
  { value: 'Issued', label: 'Emitidas' },
  { value: 'Paid', label: 'Pagadas' },
  { value: 'Cancelled', label: 'Canceladas' },
];

const DEFAULT_TERM_DAYS = 10;

function isoDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Overdue first, then what is still owed, then the rest; newest period first inside each group. */
function rank(p: PrefacturaRow): number {
  if (p.isOverdue) return 0;
  if (p.status === 'Issued') return 1;
  if (p.status === 'Draft') return 2;
  if (p.status === 'Paid') return 3;
  return 4;
}

function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Every client's prefacturas in one place: what is owed, what is overdue and what was paid, with the payment and
 * issue actions at hand so collecting does not mean opening each client.
 */
@Component({
  selector: 'app-payments-page',
  standalone: true,
  imports: [FormsModule, RouterLink, Modal],
  templateUrl: './payments-page.html',
})
export class PaymentsPage {
  private readonly billingOverview = inject(BillingOverviewService);
  private readonly billingService = inject(ClientBillingService);
  private readonly notificationService = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly overview = this.billingOverview.overview;
  readonly isLoading = this.billingOverview.isLoading;
  readonly error = this.billingOverview.error;

  readonly statusFilters = STATUS_FILTERS;
  readonly paymentMethods = PAYMENT_METHODS;
  readonly badgeClass = badgeClass;
  readonly formatMXN = formatMXN;
  readonly statusLabel = prefacturaStatusLabel;
  readonly statusTone = prefacturaStatusTone;
  readonly paymentMethodLabel = paymentMethodLabel;
  readonly monthShortLabel = monthShortLabel;
  readonly today = isoDay(new Date());

  readonly view = signal<View>('prefacturas');
  readonly status = signal<StatusFilter>('open');
  readonly search = signal('');
  /** yyyy of the service period, or '' for all; all by default so an old unpaid prefactura is never hidden. */
  readonly year = signal('');
  /** yyyy-MM of the service period, or '' for all. */
  readonly month = signal('');

  readonly busyId = signal<string | null>(null);
  readonly paying = signal<PrefacturaRow | null>(null);
  readonly issuing = signal<PrefacturaRow | null>(null);
  payment = { paidOn: this.today, paymentMethod: '03', paymentReference: '' };
  issueDueDate: string | null = null;

  private readonly prefacturas = computed(() => this.overview()?.prefacturas ?? []);
  readonly failedNames = computed(() => (this.overview()?.failedClients ?? []).map((c) => c.name).join(', '));

  readonly outstanding = computed(() => sum(this.prefacturas().filter(isOpen)));
  readonly overdue = computed(() => sum(this.prefacturas().filter((p) => p.isOverdue)));
  readonly overdueCount = computed(() => this.prefacturas().filter((p) => p.isOverdue).length);
  readonly collectedThisMonth = computed(() => {
    const key = monthKey(new Date());
    return sum(this.prefacturas().filter((p) => p.status === 'Paid' && keyOf(p.paidAt) === key));
  });
  readonly pending = computed(() => this.overview()?.pending ?? []);
  readonly pendingCount = computed(() => this.pending().reduce((n, c) => n + c.periods.length, 0));

  readonly yearOptions = computed(() => availableYears([], this.prefacturas()).map(String));

  /** Months of the chosen year that have a prefactura, newest first, for the period filter. */
  readonly monthOptions = computed(() => {
    const year = this.year();
    return [...new Set(this.prefacturas().map((p) => keyOf(p.servicePeriodStart)).filter((k): k is string => !!k && (!year || k.startsWith(year))))]
      .sort()
      .reverse();
  });

  readonly visible = computed(() => {
    const status = this.status();
    const term = this.search().trim().toLowerCase();
    const month = this.month();
    const year = this.year();
    return this.prefacturas()
      .filter((p) => {
        if (status === 'open' && !isOpen(p)) return false;
        if (status === 'overdue' && !p.isOverdue) return false;
        if (status !== 'all' && status !== 'open' && status !== 'overdue' && p.status !== status) return false;
        if (year && !p.servicePeriodStart?.startsWith(year)) return false;
        if (month && keyOf(p.servicePeriodStart) !== month) return false;
        if (term && !`${p.clientName} ${p.clientCode} ${p.invoiceNumber}`.toLowerCase().includes(term)) return false;
        return true;
      })
      .sort((a, b) => rank(a) - rank(b) || (b.servicePeriodStart ?? '').localeCompare(a.servicePeriodStart ?? ''));
  });
  readonly visibleTotal = computed(() => sum(this.visible()));

  constructor() {
    this.billingOverview.load();
    const params = this.route.snapshot.queryParamMap;
    const status = params.get('status') as StatusFilter | null;
    if (status && STATUS_FILTERS.some((f) => f.value === status)) this.status.set(status);
    if (params.get('view') === 'pending') this.view.set('pending');
    const year = params.get('year');
    if (year) this.year.set(year);
  }

  reload(): void {
    this.billingOverview.load(true);
  }

  selectView(view: View): void {
    this.view.set(view);
    this.syncUrl();
  }

  selectYear(year: string): void {
    this.year.set(year);
    this.month.set('');
    this.syncUrl();
  }

  selectStatus(status: StatusFilter): void {
    this.status.set(status);
    this.syncUrl();
  }

  /** Kept in the URL so the dashboard can link to a filter and a reload stays on it. */
  private syncUrl(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        view: this.view() === 'pending' ? 'pending' : null,
        status: this.status() === 'open' ? null : this.status(),
        year: this.year() || null,
      },
      replaceUrl: true,
    });
  }

  shortDate(value: string | null): string {
    return shortDate(value) || '—';
  }

  periodLabel(p: { servicePeriodStart: string | null }): string {
    const key = keyOf(p.servicePeriodStart);
    return key ? monthShortLabel(key) : '—';
  }

  // ---- Actions ----

  /** The PDF carries the client's fiscal data, which the overview does not load. */
  viewPdf(p: PrefacturaRow): void {
    this.busyId.set(p.id);
    this.billingService
      .getProfile(p.clientId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: async (profile) => {
          this.busyId.set(null);
          try {
            await openPrefacturaPdf({ prefactura: p, clientName: p.clientName, profile });
          } catch {
            this.notificationService.error('No se pudo abrir el PDF.');
          }
        },
        error: (error) => {
          this.busyId.set(null);
          this.notificationService.apiError(error, 'No se pudieron leer los datos fiscales del cliente.');
        },
      });
  }

  openPayment(p: PrefacturaRow): void {
    this.payment = { paidOn: this.today, paymentMethod: '03', paymentReference: '' };
    this.paying.set(p);
  }

  get paymentError(): string | null {
    if (!this.payment.paidOn) return 'Indica la fecha de pago.';
    if (this.payment.paidOn > this.today) return 'La fecha de pago no puede ser futura.';
    return null;
  }

  pay(): void {
    const p = this.paying();
    if (!p || this.paymentError) return;
    const request = {
      paidOn: this.payment.paidOn,
      paymentMethod: this.payment.paymentMethod || null,
      paymentReference: this.payment.paymentReference.trim() || null,
    };
    this.run(p, this.billingService.markPaid(p.clientId, p.id, request), `Pago de ${p.invoiceNumber} registrado.`, () => this.paying.set(null));
  }

  openIssue(p: PrefacturaRow): void {
    const due = new Date();
    due.setDate(due.getDate() + DEFAULT_TERM_DAYS);
    this.issueDueDate = p.dueDate ?? isoDay(due);
    this.issuing.set(p);
  }

  issue(): void {
    const p = this.issuing();
    if (!p) return;
    this.run(p, this.billingService.issue(p.clientId, p.id, this.issueDueDate || null), `Prefactura ${p.invoiceNumber} emitida.`, () =>
      this.issuing.set(null),
    );
  }

  private run(p: PrefacturaRow, request: Observable<Prefactura>, message: string, done: () => void): void {
    this.busyId.set(p.id);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (updated) => {
        this.busyId.set(null);
        done();
        this.billingOverview.replace(updated);
        this.notificationService.success(message, 'Listo');
      },
      error: (error) => {
        this.busyId.set(null);
        this.notificationService.apiError(error, 'No se pudo completar la acción.');
      },
    });
  }

  /** The rows on screen as a CSV, for a spreadsheet. */
  exportCsv(): void {
    const header = ['Folio', 'Cliente', 'Código', 'Periodo', 'Subtotal', 'IVA', 'Total', 'Estado', 'Emitida', 'Vigencia', 'Pagada', 'Forma de pago', 'Referencia'];
    const rows = this.visible().map((p) => [
      p.invoiceNumber,
      p.clientName,
      p.clientCode,
      keyOf(p.servicePeriodStart),
      p.subtotal.toFixed(2),
      p.taxAmount.toFixed(2),
      p.total.toFixed(2),
      prefacturaStatusLabel(p.status, p.isOverdue),
      p.issuedAt?.slice(0, 10),
      p.dueDate?.slice(0, 10),
      p.paidAt?.slice(0, 10),
      p.paymentMethod ? paymentMethodLabel(p.paymentMethod) : '',
      p.paymentReference,
    ]);
    // BOM so Excel opens the accents correctly.
    const csv = '﻿' + [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `pagos-${this.year() || 'todos'}-${this.today}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
}
