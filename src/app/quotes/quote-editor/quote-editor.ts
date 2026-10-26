import { Component, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, debounceTime, map, switchMap, takeUntil } from 'rxjs/operators';
import { NotificationService, isApiError } from '@nori/core';
import { CatalogService } from '../../catalog/catalog.service';
import { Catalog, Plan } from '../../catalog/models/catalog.models';
import { QuotesService } from '../quotes.service';
import { BillingCycle, CreateQuoteRequest, EnterpriseTerms, Quote, QuoteInput, QuotePricing } from '../models/quote.models';
import { AddOnCode, PlanCode } from '../../shared/models/shared.models';
import { ClientsService } from '../../clients/clients.service';
import { badgeClass, planLabel, quoteStatusLabel } from '../../shared/utils/labels.util';
import { BackLink } from '../../shared/directives/back-link.directive';
import { formatMXN } from '../../shared/utils/format.util';
import { ComparePlansResponse } from '../../catalog/models/catalog.models';

const DEFAULT_ENTERPRISE_TERMS: EnterpriseTerms = {
  negotiatedBasePrice: 3500,
  negotiatedCaseUnitPrice: 2,
  negotiatedCfdiStampPrice: 1.2,
  storageIncludedGb: 500,
  storageBlockSizeGb: 50,
  storageBlockPrice: 35,
  billingIncluded: true,
  inventoryIncluded: true,
  analyticsIncluded: true,
  billingCycle: 'Monthly',
  discountPercent: 0,
  annualIncreasePercent: 0,
};

/** A cleared or invalid number field arrives as null/NaN; the API needs a non-negative number. */
function amount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function count(value: unknown): number {
  return Math.floor(amount(value));
}

function cleanTerms(terms: EnterpriseTerms): EnterpriseTerms {
  return {
    ...terms,
    negotiatedBasePrice: amount(terms.negotiatedBasePrice),
    negotiatedCaseUnitPrice: amount(terms.negotiatedCaseUnitPrice),
    negotiatedCfdiStampPrice: amount(terms.negotiatedCfdiStampPrice),
    storageIncludedGb: count(terms.storageIncludedGb),
    storageBlockSizeGb: count(terms.storageBlockSizeGb) || 50,
    storageBlockPrice: amount(terms.storageBlockPrice),
    discountPercent: Math.min(amount(terms.discountPercent), 0.5),
    annualIncreasePercent: Math.min(amount(terms.annualIncreasePercent), 0.5),
  };
}

/** The API keeps a prospect's name as the first line of the notes; the form edits the rest. */
function userNotes(notes: string | undefined): string {
  if (!notes) return '';
  return /^prospecto:/i.test(notes) ? notes.split('\n').slice(1).join('\n') : notes;
}

function apiErrorDetail(error: unknown): string {
  const detail = isApiError(error) ? error.detail : '';
  return detail ? `No se pudo calcular: ${detail}` : 'No se pudo calcular la cotización con estos datos.';
}

@Component({
  selector: 'app-quote-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, BackLink],
  templateUrl: './quote-editor.html',
})
export class QuoteEditor implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly catalogService = inject(CatalogService);
  private readonly quotesService = inject(QuotesService);
  private readonly clientsService = inject(ClientsService);
  private readonly notificationService = inject(NotificationService);
  private readonly destroy$ = new Subject<void>();
  private readonly recalc$ = new Subject<void>();

  catalog: Catalog | null = null;
  isLoadingCatalog = true;
  loadError = false;

  /** Set when editing an existing quote (`/quotes/:id/edit`). */
  quoteId: string | null = null;
  /** Only draft and sent quotes can change; the rest are history. */
  isLocked = false;
  lockedStatus = '';

  clientId: string | null = null;
  clientName = '';
  /** Plan the client has today, to show what the quote replaces. */
  currentPlanName = '';
  prospectName = '';

  planCode: PlanCode = 'esencial';
  estimatedCases = 300;
  estimatedCfdiStamps = 0;
  estimatedStorageExtraGb = 0;
  billingAddOnOn = false;
  inventoryAddOnOn = false;
  enterpriseTerms: EnterpriseTerms = { ...DEFAULT_ENTERPRISE_TERMS };
  validUntil = '';
  notes = '';

  pricing: QuotePricing | null = null;
  isLoadingPreview = false;
  previewError = '';

  compareResult: ComparePlansResponse | null = null;

  isSaving = false;

  readonly badgeClass = badgeClass;
  readonly formatMXN = formatMXN;

  constructor() {
    const queryParams = this.route.snapshot.queryParamMap;
    this.quoteId = this.route.snapshot.paramMap.get('id');
    this.clientId = queryParams.get('clientId');
    const requestedPlan = queryParams.get('planCode') as PlanCode | null;
    if (requestedPlan) {
      this.planCode = requestedPlan;
    }

    forkJoin({
      catalog: this.catalogService.getCatalog(),
      quote: this.quoteId ? this.quotesService.getById(this.quoteId) : of(null),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ catalog, quote }) => {
          this.catalog = catalog;
          if (quote) {
            this.fillFrom(quote);
          } else if (!requestedPlan && catalog.plans.length > 0) {
            this.planCode = catalog.plans[0].code;
          }
          this.isLoadingCatalog = false;
          this.loadClient();
          this.scheduleRecalc();
        },
        error: (error) => {
          this.isLoadingCatalog = false;
          this.loadError = true;
          this.notificationService.apiError(
            error,
            this.quoteId ? 'No se pudo cargar la cotización.' : 'No se pudo cargar el catálogo.'
          );
        },
      });

    // Errors are caught per request: one bad input must not end the stream and leave "Calculando…" forever.
    this.recalc$
      .pipe(
        debounceTime(250),
        switchMap(() =>
          this.quotesService.preview(this.buildQuoteInput()).pipe(
            map((pricing) => ({ pricing, error: '' })),
            catchError((error) => of({ pricing: null, error: apiErrorDetail(error) }))
          )
        ),
        takeUntil(this.destroy$)
      )
      .subscribe(({ pricing, error }) => {
        this.pricing = pricing;
        this.isLoadingPreview = false;
        this.previewError = error;
      });

    this.recalc$
      .pipe(
        debounceTime(250),
        switchMap(() =>
          this.catalogService
            .comparePlans({
              cases: count(this.estimatedCases),
              cfdiStamps: count(this.estimatedCfdiStamps),
              storageExtraGb: count(this.estimatedStorageExtraGb),
              billingAddOn: this.billingAddOnOn,
              inventoryAddOn: this.inventoryAddOnOn,
            })
            .pipe(catchError(() => of(null)))
        ),
        takeUntil(this.destroy$)
      )
      .subscribe((result) => (this.compareResult = result));
  }

  get isEnterprise(): boolean {
    return this.planCode === 'enterprise';
  }

  /** The API takes fractions; the form shows percentages. */
  get discountPct(): number {
    return Math.round((this.enterpriseTerms.discountPercent ?? 0) * 10000) / 100;
  }

  set discountPct(value: number) {
    this.enterpriseTerms.discountPercent = (Number(value) || 0) / 100;
  }

  get annualIncreasePct(): number {
    return Math.round((this.enterpriseTerms.annualIncreasePercent ?? 0) * 10000) / 100;
  }

  set annualIncreasePct(value: number) {
    this.enterpriseTerms.annualIncreasePercent = (Number(value) || 0) / 100;
  }

  setBillingCycle(cycle: BillingCycle): void {
    this.enterpriseTerms.billingCycle = cycle;
    this.scheduleRecalc();
  }

  get isAnnual(): boolean {
    return this.pricing?.billingCycle === 'Annual';
  }

  get selectedPlan(): Plan | null {
    return this.catalog?.plans.find((p) => p.code === this.planCode) ?? null;
  }

  addOnRule(code: AddOnCode) {
    return this.selectedPlan?.addOnRules.find((rule) => rule.addOnCode === code) ?? null;
  }

  selectPlan(code: PlanCode): void {
    this.planCode = code;
    this.scheduleRecalc();
  }

  toggleBilling(): void {
    this.billingAddOnOn = !this.billingAddOnOn;
    this.scheduleRecalc();
  }

  toggleInventory(): void {
    this.inventoryAddOnOn = !this.inventoryAddOnOn;
    this.scheduleRecalc();
  }

  scheduleRecalc(): void {
    this.isLoadingPreview = true;
    this.recalc$.next();
  }

  get canSave(): boolean {
    if (this.isLocked || this.isSaving || this.isLoadingPreview || !this.pricing) return false;
    return this.clientId != null || this.prospectName.trim().length > 0;
  }

  /** `apply`: also accept it right away, replacing the client's subscription. */
  save(apply = false): void {
    if (!this.canSave) return;
    if (apply && !confirm(`¿Aplicar ${this.selectedPlan?.name ?? 'este plan'} a ${this.clientName || 'el cliente'}? Su suscripción actual se reemplaza de inmediato.`)) {
      return;
    }

    this.isSaving = true;
    const request: CreateQuoteRequest = {
      ...this.buildQuoteInput(),
      clientId: this.clientId ?? undefined,
      prospectName: this.clientId ? undefined : this.prospectName.trim(),
      validUntil: this.validUntil || undefined,
      notes: this.notes.trim() || undefined,
    };

    let createdId: string | null = null;
    const save$ = this.quoteId ? this.quotesService.update(this.quoteId, request) : this.quotesService.create(request);
    save$
      .pipe(
        switchMap((quote) => {
          createdId = quote.id;
          return apply ? this.quotesService.accept(quote.id) : of(quote);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (quote) => {
          this.isSaving = false;
          // replaceUrl: "back" from the result must not reopen this form.
          if (apply) {
            this.notificationService.success(`${this.clientName || 'El cliente'} ya tiene ${quote.planName}.`, 'Plan aplicado');
            this.router.navigate(['/clients', this.clientId], { replaceUrl: true });
          } else {
            this.notificationService.success(this.isEditing ? 'Cotización actualizada.' : 'Cotización guardada correctamente.', 'Listo');
            this.router.navigate(['/quotes', quote.id], { replaceUrl: true });
          }
        },
        error: (error) => {
          this.isSaving = false;
          if (createdId) {
            // Saved but not applied: the quote page lets the admin retry without quoting again.
            this.notificationService.apiError(error, 'La cotización se guardó, pero no se pudo aplicar.');
            this.router.navigate(['/quotes', createdId], { replaceUrl: true });
            return;
          }
          this.notificationService.apiError(error, 'No se pudo guardar la cotización.');
        },
      });
  }

  get isEditing(): boolean {
    return this.quoteId != null;
  }

  /** Where "back" and "discard" go when there is no history. */
  get fallbackUrl(): string {
    if (this.quoteId) return `/quotes/${this.quoteId}`;
    return this.clientId ? `/clients/${this.clientId}` : '/quotes';
  }

  private fillFrom(quote: Quote): void {
    this.isLocked = quote.status !== 'Draft' && quote.status !== 'Sent';
    this.lockedStatus = quoteStatusLabel(quote.status);
    this.clientId = quote.clientId ?? null;
    this.clientName = quote.clientName ?? '';
    this.prospectName = quote.prospectName ?? '';
    this.planCode = quote.planCode;
    this.estimatedCases = quote.estimatedCases;
    this.estimatedCfdiStamps = quote.estimatedCfdiStamps;
    this.estimatedStorageExtraGb = quote.estimatedStorageExtraGb;
    this.billingAddOnOn = quote.selectedAddOnCodes.includes('billing');
    this.inventoryAddOnOn = quote.selectedAddOnCodes.includes('inventory');
    this.enterpriseTerms = { ...DEFAULT_ENTERPRISE_TERMS, ...(quote.enterpriseTerms ?? {}) };
    this.validUntil = quote.validUntil ? quote.validUntil.slice(0, 10) : '';
    this.notes = userNotes(quote.notes);
  }

  private loadClient(): void {
    if (!this.clientId) return;
    this.clientsService
      .getById(this.clientId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (client) => {
          this.clientName = client.name;
          this.currentPlanName = client.subscription ? planLabel(client.subscription.planCode) : 'Sin plan';
        },
      });
  }

  private buildQuoteInput(): QuoteInput {
    const selectedAddOnCodes: AddOnCode[] = [];
    if (!this.isEnterprise) {
      if (this.addOnRule('billing')?.availability === 'Optional' && this.billingAddOnOn) {
        selectedAddOnCodes.push('billing');
      }
      if (this.addOnRule('inventory')?.availability === 'Optional' && this.inventoryAddOnOn) {
        selectedAddOnCodes.push('inventory');
      }
    }

    return {
      planCode: this.planCode,
      estimatedCases: count(this.estimatedCases),
      estimatedCfdiStamps: count(this.estimatedCfdiStamps),
      estimatedStorageExtraGb: count(this.estimatedStorageExtraGb),
      selectedAddOnCodes,
      enterpriseTerms: this.isEnterprise ? cleanTerms(this.enterpriseTerms) : undefined,
    };
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
