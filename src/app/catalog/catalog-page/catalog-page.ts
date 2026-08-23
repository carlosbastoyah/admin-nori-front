import { Component, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { NotificationService } from '@nori/core';
import { CatalogService } from '../catalog.service';
import { Catalog, ComparePlansResponse } from '../models/catalog.models';
import { badgeClass, planLabel } from '../../shared/utils/labels.util';
import { formatMXN } from '../../shared/utils/format.util';

const AVAILABILITY_LABELS: Record<string, string> = {
  Included: 'Incluido',
  Optional: 'Opcional',
  NotAvailable: 'No disponible',
};

@Component({
  selector: 'app-catalog-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './catalog-page.html',
})
export class CatalogPage implements OnDestroy {
  private readonly catalogService = inject(CatalogService);
  private readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly destroy$ = new Subject<void>();

  catalog: Catalog | null = null;
  isLoading = true;
  errorMessage = '';

  compareCases = 300;
  compareCfdiStamps = 0;
  compareStorageExtraGb = 0;
  compareBilling = false;
  compareInventory = false;
  compareResult: ComparePlansResponse | null = null;
  isComparing = false;

  readonly badgeClass = badgeClass;
  readonly planLabel = planLabel;
  readonly formatMXN = formatMXN;

  constructor() {
    this.catalogService
      .getCatalog()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (catalog) => {
          this.catalog = catalog;
          this.isLoading = false;
          this.runCompare();
        },
        error: (error) => {
          this.isLoading = false;
          this.errorMessage = 'No se pudo cargar el catálogo.';
          this.notificationService.apiError(error, this.errorMessage);
        },
      });
  }

  availabilityLabel(availability: string): string {
    return AVAILABILITY_LABELS[availability] ?? availability;
  }

  quoteFromPlan(planCode: string): void {
    this.router.navigate(['/quotes/new'], { queryParams: { planCode } });
  }

  runCompare(): void {
    this.isComparing = true;
    this.catalogService
      .comparePlans({
        cases: this.compareCases,
        cfdiStamps: this.compareCfdiStamps,
        storageExtraGb: this.compareStorageExtraGb,
        billingAddOn: this.compareBilling,
        inventoryAddOn: this.compareInventory,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.compareResult = result;
          this.isComparing = false;
        },
        error: (error) => {
          this.isComparing = false;
          this.notificationService.apiError(error, 'No se pudo calcular la comparación.');
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
