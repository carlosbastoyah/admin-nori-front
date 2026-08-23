import { Component, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, switchMap, takeUntil } from 'rxjs/operators';
import { NotificationService } from '@nori/core';
import { CatalogService } from '../../catalog/catalog.service';
import { Catalog, Plan } from '../../catalog/models/catalog.models';
import { QuotesService } from '../quotes.service';
import { CreateQuoteRequest, EnterpriseTerms, QuoteInput, QuotePricing } from '../models/quote.models';
import { AddOnCode, PlanCode } from '../../shared/models/shared.models';
import { ClientsService } from '../../clients/clients.service';
import { badgeClass } from '../../shared/utils/labels.util';
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
};

@Component({
  selector: 'app-quote-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
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

  clientId: string | null = null;
  clientName = '';
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
    this.clientId = queryParams.get('clientId');
    const requestedPlan = queryParams.get('planCode') as PlanCode | null;
    if (requestedPlan) {
      this.planCode = requestedPlan;
    }

    if (this.clientId) {
      this.clientsService
        .getById(this.clientId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({ next: (client) => (this.clientName = client.name) });
    }

    this.catalogService
      .getCatalog()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (catalog) => {
          this.catalog = catalog;
          this.isLoadingCatalog = false;
          if (!requestedPlan && catalog.plans.length > 0) {
            this.planCode = catalog.plans[0].code;
          }
          this.scheduleRecalc();
        },
        error: (error) => {
          this.isLoadingCatalog = false;
          this.notificationService.apiError(error, 'No se pudo cargar el catálogo.');
        },
      });

    this.recalc$
      .pipe(debounceTime(250), switchMap(() => this.quotesService.preview(this.buildQuoteInput())), takeUntil(this.destroy$))
      .subscribe({
        next: (pricing) => {
          this.pricing = pricing;
          this.isLoadingPreview = false;
          this.previewError = '';
        },
        error: (error) => {
          this.isLoadingPreview = false;
          this.pricing = null;
          this.previewError = 'No se pudo calcular la cotización con estos datos.';
          this.notificationService.apiError(error, this.previewError);
        },
      });

    this.recalc$
      .pipe(
        debounceTime(250),
        switchMap(() =>
          this.catalogService.comparePlans({
            cases: this.estimatedCases,
            cfdiStamps: this.estimatedCfdiStamps,
            storageExtraGb: this.estimatedStorageExtraGb,
            billingAddOn: this.billingAddOnOn,
            inventoryAddOn: this.inventoryAddOnOn,
          })
        ),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (result) => (this.compareResult = result),
        error: () => (this.compareResult = null),
      });
  }

  get isEnterprise(): boolean {
    return this.planCode === 'enterprise';
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
    if (this.isSaving || !this.pricing) return false;
    return this.clientId != null || this.prospectName.trim().length > 0;
  }

  save(): void {
    if (!this.canSave) return;

    this.isSaving = true;
    const request: CreateQuoteRequest = {
      ...this.buildQuoteInput(),
      clientId: this.clientId ?? undefined,
      prospectName: this.clientId ? undefined : this.prospectName.trim(),
      validUntil: this.validUntil || undefined,
      notes: this.notes.trim() || undefined,
    };

    this.quotesService
      .create(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (quote) => {
          this.isSaving = false;
          this.notificationService.success('Cotización guardada correctamente.', 'Listo');
          this.router.navigate(['/quotes', quote.id]);
        },
        error: (error) => {
          this.isSaving = false;
          this.notificationService.apiError(error, 'No se pudo guardar la cotización.');
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
      estimatedCases: this.estimatedCases,
      estimatedCfdiStamps: this.estimatedCfdiStamps,
      estimatedStorageExtraGb: this.estimatedStorageExtraGb,
      selectedAddOnCodes,
      enterpriseTerms: this.isEnterprise ? this.enterpriseTerms : undefined,
    };
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
