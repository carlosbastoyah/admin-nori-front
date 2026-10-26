import { Component, DestroyRef, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { NotificationService } from '@nori/core';
import { ClientBillingService } from '../client-billing.service';
import { BillingLineType, Prefactura, PrefacturaLineInput } from '../models/billing.models';
import { Modal } from '../../shared/components/modal/modal';
import { formatMXN } from '../../shared/utils/format.util';
import { longDate } from '../prefactura/prefactura-pdf';

const TAX_RATE = 0.16;
const MAX_LINES = 50;

/** Concepts that may carry a negative price; the rest must not lower the total. */
const NEGATIVE_ALLOWED: ReadonlySet<BillingLineType> = new Set(['Discount', 'MigrationAdjustment']);

const LINE_TYPES: ReadonlyArray<{ value: BillingLineType; label: string }> = [
  { value: 'PlanBase', label: 'Cuota base' },
  { value: 'CaseTier', label: 'Estudios' },
  { value: 'AddOn', label: 'Módulo' },
  { value: 'CfdiStamp', label: 'Timbres' },
  { value: 'StorageBlock', label: 'Almacenamiento' },
  { value: 'MigrationAdjustment', label: 'Ajuste' },
  { value: 'Discount', label: 'Descuento' },
  { value: 'Note', label: 'Nota' },
];

/** Edits the concepts, vigencia and notes of a draft or issued prefactura; totals follow as you type. */
@Component({
  selector: 'app-prefactura-editor',
  standalone: true,
  imports: [FormsModule, Modal],
  templateUrl: './prefactura-editor.html',
})
export class PrefacturaEditor implements OnInit {
  private readonly billingService = inject(ClientBillingService);
  private readonly notificationService = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly clientId = input.required<string>();
  readonly prefactura = input.required<Prefactura>();
  readonly saved = output<Prefactura>();
  readonly closed = output<void>();

  readonly lineTypes = LINE_TYPES;
  readonly formatMXN = formatMXN;
  readonly longDate = longDate;
  readonly isSaving = signal(false);
  readonly lines = signal<PrefacturaLineInput[]>([]);
  dueDate: string | null = null;
  notes = '';

  readonly subtotal = computed(() => this.lines().reduce((sum, l) => sum + this.amount(l), 0));
  readonly tax = computed(() => Math.round(this.subtotal() * TAX_RATE * 100) / 100);
  readonly total = computed(() => this.subtotal() + this.tax());
  /** The first problem that keeps the prefactura from saving, as the API would report it. */
  readonly error = computed<string | null>(() => {
    const lines = this.lines();
    if (lines.length === 0) return 'Agrega al menos un concepto.';
    if (lines.length > MAX_LINES) return `La prefactura admite hasta ${MAX_LINES} conceptos.`;
    for (const line of lines) {
      if (!line.description?.trim()) return 'Cada concepto necesita una descripción.';
      if (line.lineType === 'Note') continue;
      if (line.quantity == null || Number(line.quantity) < 0) return 'La cantidad no puede ser negativa ni quedar vacía.';
      if (line.unitPrice == null || (line.unitPrice as unknown) === '') return `Falta el precio de «${line.description.trim()}».`;
      if (Number(line.unitPrice) < 0 && !NEGATIVE_ALLOWED.has(line.lineType))
        return `«${line.description.trim()}» tiene precio negativo: cámbialo a tipo Descuento o Ajuste.`;
    }
    if (this.subtotal() < 0) return 'El subtotal no puede ser negativo.';
    return null;
  });
  readonly isValid = computed(() => this.error() === null);
  private snapshot = '';

  ngOnInit(): void {
    const p = this.prefactura();
    this.lines.set(p.lines.map(({ lineType, description, detail, quantity, unitPrice }) => ({ lineType, description, detail, quantity, unitPrice })));
    this.dueDate = p.dueDate;
    this.notes = p.notes ?? '';
    this.snapshot = this.state();
  }

  /** A note only informs: it never adds to the total, here or in the API. */
  amount(line: PrefacturaLineInput): number {
    if (line.lineType === 'Note') return 0;
    return Math.round((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0) * 100) / 100;
  }

  /** Asks before throwing away edits. */
  close(): void {
    if (this.state() !== this.snapshot && !confirm('Tienes cambios sin guardar. ¿Descartarlos?')) return;
    this.closed.emit();
  }

  private state(): string {
    return JSON.stringify([this.lines(), this.dueDate || null, this.notes.trim()]);
  }

  /** Signals only notice a new array, so every change goes through here. */
  patch(index: number, change: Partial<PrefacturaLineInput>): void {
    this.lines.update((lines) => lines.map((line, i) => (i === index ? { ...line, ...change } : line)));
  }

  add(): void {
    if (this.lines().length >= MAX_LINES) return;
    this.lines.update((lines) => [...lines, { lineType: 'MigrationAdjustment', description: '', detail: null, quantity: 1, unitPrice: 0 }]);
  }

  remove(index: number): void {
    this.lines.update((lines) => lines.filter((_, i) => i !== index));
  }

  move(index: number, delta: -1 | 1): void {
    this.lines.update((lines) => {
      const next = [...lines];
      const target = index + delta;
      if (target < 0 || target >= next.length) return lines;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  save(): void {
    if (!this.isValid()) return;
    this.isSaving.set(true);
    this.billingService
      .update(this.clientId(), this.prefactura().id, {
        lines: this.lines().map((l) => ({
          ...l,
          description: l.description.trim(),
          detail: l.detail?.trim() || null,
          quantity: l.lineType === 'Note' ? 0 : Number(l.quantity) || 0,
          unitPrice: l.lineType === 'Note' ? 0 : Number(l.unitPrice) || 0,
        })),
        dueDate: this.dueDate || null,
        notes: this.notes.trim() || null,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (prefactura) => {
          this.isSaving.set(false);
          this.notificationService.success(`Prefactura ${prefactura.invoiceNumber} actualizada.`, 'Listo');
          this.saved.emit(prefactura);
        },
        error: (error) => {
          this.isSaving.set(false);
          this.notificationService.apiError(error, 'No se pudo guardar la prefactura.');
        },
      });
  }
}
