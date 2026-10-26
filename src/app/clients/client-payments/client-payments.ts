import { Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Subscription, forkJoin, fromEvent, merge } from 'rxjs';
import { NotificationService } from '@nori/core';
import { ClientBillingService } from '../client-billing.service';
import { BillingPeriod, ClientBillingProfile, Prefactura, PrefacturaPreview } from '../models/billing.models';
import { Modal } from '../../shared/components/modal/modal';
import { PrefacturaEditor } from '../prefactura-editor/prefactura-editor';
import { formatMXN, formatNumber } from '../../shared/utils/format.util';
import { PAYMENT_METHODS, badgeClass, paymentMethodLabel, prefacturaStatusLabel, prefacturaStatusTone } from '../../shared/utils/labels.util';
import { downloadPrefacturaPdf, longDate, openPrefacturaPdf, shortDate } from '../prefactura/prefactura-pdf';

/** Days a new prefactura gives the lab to pay. */
const DEFAULT_TERM_DAYS = 10;

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export interface PaymentsSummary {
  missingPeriods: number;
  outstanding: number;
  overdue: number;
}

function isoDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return isoDay(date);
}

/**
 * Pagos of a client: the months since the service started, which of them already have a prefactura, and the
 * prefacturas from draft to paid, with their PDF.
 */
@Component({
  selector: 'app-client-payments',
  standalone: true,
  imports: [FormsModule, Modal, PrefacturaEditor],
  host: { '(document:click)': 'closeMenu()', '(document:keydown.escape)': 'closeMenu()', '(window:resize)': 'closeMenu()' },
  templateUrl: './client-payments.html',
})
export class ClientPayments {
  private readonly billingService = inject(ClientBillingService);
  private readonly notificationService = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly clientId = input.required<string>();
  readonly clientName = input.required<string>();
  readonly profile = input<ClientBillingProfile | null>(null);
  readonly hasSubscription = input(false);
  /** Bumped by the page when something that changes the periods (the start date) was saved. */
  readonly reloadKey = input(0);
  readonly summaryChange = output<PaymentsSummary>();

  readonly badgeClass = badgeClass;
  readonly formatMXN = formatMXN;
  readonly formatNumber = formatNumber;
  readonly statusLabel = prefacturaStatusLabel;
  readonly statusTone = prefacturaStatusTone;
  readonly paymentMethodLabel = paymentMethodLabel;
  readonly paymentMethods = PAYMENT_METHODS;
  readonly longDate = longDate;
  /** yyyy-MM-dd of today for the admin, the bound of payment dates. */
  readonly today = isoDay(new Date());

  readonly isLoading = signal(true);
  readonly periods = signal<BillingPeriod[]>([]);
  readonly prefacturas = signal<Prefactura[]>([]);
  readonly statusFilter = signal<'all' | 'open' | 'Paid' | 'Cancelled'>('all');
  readonly busyId = signal<string | null>(null);
  readonly openMenuId = signal<string | null>(null);
  /** The actions menu floats over the page so the table's scroll box cannot clip it. */
  readonly menuPosition = signal<{ top: number; left: number } | null>(null);

  readonly missingPeriods = computed(() => this.periods().filter((p) => !p.invoiceId));
  readonly openPrefacturas = computed(() => this.prefacturas().filter((p) => p.status === 'Draft' || p.status === 'Issued'));
  readonly outstanding = computed(() => this.openPrefacturas().reduce((sum, p) => sum + p.total, 0));
  readonly overdue = computed(() => this.prefacturas().filter((p) => p.isOverdue).reduce((sum, p) => sum + p.total, 0));
  readonly paidThisYear = computed(() => {
    const year = String(new Date().getFullYear());
    return this.prefacturas()
      .filter((p) => p.status === 'Paid' && p.paidAt?.startsWith(year))
      .reduce((sum, p) => sum + p.total, 0);
  });
  readonly visiblePrefacturas = computed(() => {
    const filter = this.statusFilter();
    if (filter === 'all') return this.prefacturas();
    if (filter === 'open') return this.openPrefacturas();
    return this.prefacturas().filter((p) => p.status === filter);
  });

  // Generate dialog.
  readonly isGenerateOpen = signal(false);
  readonly preview = signal<PrefacturaPreview | null>(null);
  readonly isPreviewing = signal(false);
  readonly previewError = signal<string | null>(null);
  readonly isGenerating = signal(false);
  /** The studies typed differ from the ones the preview was priced with. */
  readonly isPreviewStale = signal(false);
  /** periodStart (yyyy-MM-dd) of the period being charged. */
  generatePeriod = '';
  studiesOverride: number | null = null;
  generateDueDate: string | null = null;
  generateNotes = '';
  private previewRequest?: Subscription;

  // Editor, issue and payment dialogs.
  readonly editing = signal<Prefactura | null>(null);
  readonly issuing = signal<Prefactura | null>(null);
  readonly paying = signal<Prefactura | null>(null);
  issueDueDate: string | null = null;
  payment = { paidOn: isoDay(new Date()), paymentMethod: '03', paymentReference: '' };

  constructor() {
    // The page scrolls inside the layout's <main>, not the window, and scroll events do not bubble: listen in the
    // capture phase so any scrolling container closes the floating menu instead of leaving it behind. Safari does
    // not always deliver an element's scroll there, so the wheel and touch gestures that start a scroll count too.
    merge(
      fromEvent(window, 'scroll', { capture: true, passive: true }),
      fromEvent(window, 'wheel', { capture: true, passive: true }),
      fromEvent(window, 'touchmove', { capture: true, passive: true }),
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.openMenuId()) this.closeMenu();
      });

    effect(() => {
      this.clientId();
      this.reloadKey();
      untracked(() => this.load());
    });

    effect(() => {
      const summary: PaymentsSummary = {
        missingPeriods: this.missingPeriods().length,
        outstanding: this.outstanding(),
        overdue: this.overdue(),
      };
      untracked(() => this.summaryChange.emit(summary));
    });
  }

  load(): void {
    this.isLoading.set(true);
    forkJoin({
      periods: this.billingService.listPeriods(this.clientId()),
      prefacturas: this.billingService.list(this.clientId()),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ periods, prefacturas }) => {
          this.periods.set(periods);
          this.prefacturas.set(prefacturas);
          this.isLoading.set(false);
          if (this.isGenerateOpen() && !this.generatePeriod) this.selectPeriod(this.defaultPeriod()?.periodStart);
        },
        error: (error) => {
          this.isLoading.set(false);
          this.notificationService.apiError(error, 'No se pudieron cargar los pagos del cliente.');
        },
      });
  }

  monthLabel(day: string | null): string {
    if (!day) return '—';
    const [y, m] = day.split('-').map(Number);
    return `${MONTHS[m - 1]} ${y}`;
  }

  shortDate(value: string | null): string {
    return shortDate(value) || '—';
  }

  periodTone(period: BillingPeriod): string {
    if (!period.invoiceId) return period.isCurrent ? 'border-dashed border-border-m' : 'border-dashed border-lo bg-lo-light';
    if (period.isOverdue) return 'border-hi bg-hi-light';
    if (period.invoiceStatus === 'Paid') return 'border-border-s bg-ok-light';
    return 'border-border-s';
  }

  // ---- Generate ----

  /** Opens the dialog on the oldest month without prefactura, or on a given one. */
  openGenerate(period?: BillingPeriod): void {
    this.generatePeriod = '';
    this.generateDueDate = addDays(DEFAULT_TERM_DAYS);
    this.generateNotes = '';
    this.preview.set(null);
    this.previewError.set(null);
    this.isGenerateOpen.set(true);
    // Before the periods load there is nothing to pick yet; load() picks it when they arrive.
    const target = period ?? this.defaultPeriod();
    if (target) this.selectPeriod(target.periodStart);
  }

  closeGenerate(): void {
    this.previewRequest?.unsubscribe();
    this.isGenerateOpen.set(false);
  }

  /** The oldest period without prefactura, else the current one. */
  private defaultPeriod(): BillingPeriod | undefined {
    return [...this.missingPeriods()].pop() ?? this.periods()[0];
  }

  selectPeriod(periodStart: string | undefined): void {
    if (!periodStart) return;
    this.generatePeriod = periodStart;
    this.studiesOverride = null;
    this.loadPreview();
  }

  onStudiesChange(): void {
    this.isPreviewStale.set(true);
  }

  /** Whole, non-negative studies; anything else cannot be priced. */
  get studiesError(): string | null {
    const value = this.studiesOverride as unknown;
    if (value == null || value === '') return null;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0) return 'Escribe un número entero de estudios, cero o más.';
    return null;
  }

  get selectedPeriod(): BillingPeriod | undefined {
    return this.periods().find((p) => p.periodStart === this.generatePeriod);
  }

  /** Why "Generar" is off, shown next to it; null when it can go. */
  get generateBlocker(): string | null {
    const preview = this.preview();
    if (!this.generatePeriod) return 'Elige el periodo.';
    if (this.selectedPeriod?.invoiceId) return 'Ese periodo ya tiene prefactura.';
    if (this.studiesError) return this.studiesError;
    if (this.isPreviewing() || !preview) return this.previewError() ? 'Corrige el periodo para continuar.' : 'Calculando…';
    if (this.isPreviewStale()) return 'Pulsa «Recalcular» para ver el total con los estudios capturados.';
    if (preview.usageWarning && this.studiesOverride == null) return 'Captura los estudios del periodo.';
    if (this.generateDueDate && this.generateDueDate < preview.periodStart) return 'La vigencia no puede ser anterior al periodo.';
    return null;
  }

  loadPreview(): void {
    if (!this.generatePeriod || this.studiesError) return;
    // A slow answer for a period picked earlier must not overwrite the current one.
    this.previewRequest?.unsubscribe();
    this.isPreviewing.set(true);
    this.isPreviewStale.set(false);
    this.previewError.set(null);
    this.previewRequest = this.billingService
      .preview(this.clientId(), this.generateRequest())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (preview) => {
          this.preview.set(preview);
          this.isPreviewing.set(false);
        },
        error: (error) => {
          this.preview.set(null);
          this.isPreviewing.set(false);
          this.previewError.set(error?.detail || error?.message || 'No se pudo calcular el periodo.');
        },
      });
  }

  generate(): void {
    if (this.generateBlocker) return;
    this.isGenerating.set(true);
    this.billingService
      .generate(this.clientId(), this.generateRequest())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (prefactura) => {
          this.isGenerating.set(false);
          this.isGenerateOpen.set(false);
          this.notificationService.success(`Prefactura ${prefactura.invoiceNumber} creada como borrador.`, 'Listo');
          this.load();
        },
        error: (error) => {
          this.isGenerating.set(false);
          this.notificationService.apiError(error, 'No se pudo generar la prefactura.');
        },
      });
  }

  private generateRequest() {
    return {
      periodStart: this.generatePeriod,
      studies: this.studiesOverride == null || (this.studiesOverride as unknown) === '' ? null : Number(this.studiesOverride),
      dueDate: this.generateDueDate || null,
      notes: this.generateNotes.trim() || null,
    };
  }

  // ---- Actions on a prefactura ----

  toggleMenu(prefactura: Prefactura, event: MouseEvent): void {
    event.stopPropagation();
    if (this.openMenuId() === prefactura.id) {
      this.closeMenu();
      return;
    }
    const button = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const width = 208;
    const height = 330;
    // Opens upwards when it would run past the bottom of the window.
    const top = button.bottom + 4 + height > window.innerHeight ? Math.max(8, button.top - height - 4) : button.bottom + 4;
    this.menuPosition.set({ top, left: Math.max(8, button.right - width) });
    this.openMenuId.set(prefactura.id);
  }

  closeMenu(): void {
    this.openMenuId.set(null);
  }

  readonly menuPrefactura = computed(() => this.prefacturas().find((p) => p.id === this.openMenuId()) ?? null);

  prefacturaOfPeriod(period: BillingPeriod): Prefactura | undefined {
    return this.prefacturas().find((p) => p.id === period.invoiceId);
  }

  async download(prefactura: Prefactura): Promise<void> {
    this.closeMenu();
    if (!this.profile()) this.notificationService.warning('El cliente no tiene datos fiscales; el PDF sale sin RFC ni domicilio.', 'Aviso');
    try {
      await downloadPrefacturaPdf({ prefactura, clientName: this.clientName(), profile: this.profile() });
    } catch {
      this.notificationService.error('No se pudo generar el PDF.');
    }
  }

  async view(prefactura: Prefactura): Promise<void> {
    this.closeMenu();
    try {
      await openPrefacturaPdf({ prefactura, clientName: this.clientName(), profile: this.profile() });
    } catch {
      this.notificationService.error('No se pudo abrir el PDF.');
    }
  }

  edit(prefactura: Prefactura): void {
    this.closeMenu();
    this.editing.set(prefactura);
  }

  onEdited(updated: Prefactura): void {
    this.editing.set(null);
    this.replace(updated);
  }

  openIssue(prefactura: Prefactura): void {
    this.closeMenu();
    this.issueDueDate = prefactura.dueDate ?? addDays(DEFAULT_TERM_DAYS);
    this.issuing.set(prefactura);
  }

  issue(): void {
    const prefactura = this.issuing();
    if (!prefactura) return;
    this.run(prefactura, this.billingService.issue(this.clientId(), prefactura.id, this.issueDueDate || null), `Prefactura ${prefactura.invoiceNumber} emitida.`, () =>
      this.issuing.set(null),
    );
  }

  openPayment(prefactura: Prefactura): void {
    this.closeMenu();
    this.payment = { paidOn: isoDay(new Date()), paymentMethod: '03', paymentReference: '' };
    this.paying.set(prefactura);
  }

  get paymentError(): string | null {
    if (!this.payment.paidOn) return 'Indica la fecha de pago.';
    if (this.payment.paidOn > isoDay(new Date())) return 'La fecha de pago no puede ser futura.';
    return null;
  }

  pay(): void {
    const prefactura = this.paying();
    if (!prefactura || this.paymentError) return;
    const request = {
      paidOn: this.payment.paidOn,
      paymentMethod: this.payment.paymentMethod || null,
      paymentReference: this.payment.paymentReference.trim() || null,
    };
    this.run(prefactura, this.billingService.markPaid(this.clientId(), prefactura.id, request), `Pago de ${prefactura.invoiceNumber} registrado.`, () =>
      this.paying.set(null),
    );
  }

  revertPayment(prefactura: Prefactura): void {
    this.closeMenu();
    if (!confirm(`¿Revertir el pago de ${prefactura.invoiceNumber}? Vuelve a quedar emitida y por cobrar.`)) return;
    this.run(prefactura, this.billingService.revertPayment(this.clientId(), prefactura.id), 'Pago revertido.');
  }

  cancel(prefactura: Prefactura): void {
    this.closeMenu();
    if (!confirm(`¿Cancelar ${prefactura.invoiceNumber}? El periodo queda libre para generar otra prefactura.`)) return;
    this.run(prefactura, this.billingService.cancel(this.clientId(), prefactura.id), `Prefactura ${prefactura.invoiceNumber} cancelada.`);
  }

  remove(prefactura: Prefactura): void {
    this.closeMenu();
    if (!confirm(`¿Eliminar ${prefactura.invoiceNumber}? Esta acción no se puede deshacer.`)) return;
    this.busyId.set(prefactura.id);
    this.billingService
      .delete(this.clientId(), prefactura.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busyId.set(null);
          this.notificationService.success(`Prefactura ${prefactura.invoiceNumber} eliminada.`, 'Listo');
          this.load();
        },
        error: (error) => {
          this.busyId.set(null);
          this.notificationService.apiError(error, 'No se pudo eliminar la prefactura.');
        },
      });
  }

  private run(prefactura: Prefactura, request: ReturnType<ClientBillingService['issue']>, message: string, done?: () => void): void {
    this.busyId.set(prefactura.id);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (updated) => {
        this.busyId.set(null);
        done?.();
        this.notificationService.success(message, 'Listo');
        // The period list carries each prefactura's status, so it reloads too.
        this.load();
        this.replace(updated);
      },
      error: (error) => {
        this.busyId.set(null);
        this.notificationService.apiError(error, 'No se pudo completar la acción.');
      },
    });
  }

  private replace(updated: Prefactura): void {
    this.prefacturas.update((list) => list.map((p) => (p.id === updated.id ? updated : p)));
    this.periods.update((list) =>
      list.map((p) => (p.invoiceId === updated.id ? { ...p, invoiceStatus: updated.status, invoiceTotal: updated.total, isOverdue: updated.isOverdue } : p)),
    );
  }
}
