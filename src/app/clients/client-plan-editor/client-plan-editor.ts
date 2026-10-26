import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Observable, from } from 'rxjs';
import { concatMap, finalize, last } from 'rxjs/operators';
import { NotificationService } from '@nori/core';
import { CatalogService } from '../../catalog/catalog.service';
import { Catalog, Plan } from '../../catalog/models/catalog.models';
import { AddOnCode, PlanCode } from '../../shared/models/shared.models';
import { formatMXN } from '../../shared/utils/format.util';
import { planLabel } from '../../shared/utils/labels.util';
import { ClientsService } from '../clients.service';
import { ClientSubscription } from '../models/client.models';
import {
  addOnPrice,
  includedAddOns,
  monthlyFee,
  optionalAddOns,
  planName,
  purchasableAddOns,
  selfServicePlans,
} from '../client-new/client-new.model';

/** Add-ons the client keeps once on `plan`: the active ones the plan still sells apart. */
function keptAddOns(subscription: ClientSubscription, plan: Plan): AddOnCode[] {
  const sold = optionalAddOns(plan).map((r) => r.addOnCode);
  return subscription.addOns.filter((a) => a.isActive && sold.includes(a.code)).map((a) => a.code);
}

@Component({
  selector: 'app-client-plan-editor',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './client-plan-editor.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientPlanEditor {
  private readonly clientsService = inject(ClientsService);
  private readonly catalogService = inject(CatalogService);
  private readonly notificationService = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly clientId = input.required<string>();
  readonly subscription = input.required<ClientSubscription>();
  /** Every change was applied; the editor can close. */
  readonly saved = output<void>();
  /** Something may have been applied before an error: the subscription must be reloaded. */
  readonly refresh = output<void>();
  readonly closed = output<void>();

  readonly formatMXN = formatMXN;
  readonly planName = planName;
  readonly addOnPrice = addOnPrice;
  readonly optionalAddOns = optionalAddOns;
  readonly includedAddOns = includedAddOns;

  readonly catalog = signal<Catalog | null>(null);
  readonly isLoadingCatalog = signal(true);
  readonly catalogError = signal(false);
  readonly isSaving = signal(false);

  /** Draft, reset whenever a fresh subscription comes in. */
  readonly planCode = linkedSignal<PlanCode>(() => this.subscription().planCode);
  readonly wanted = linkedSignal<AddOnCode[]>(() =>
    this.subscription().addOns.filter((a) => a.isActive).map((a) => a.code),
  );

  private readonly selfService = computed(() => selfServicePlans(this.catalog()));
  /** Self-service plans first, then the negotiated ones (Enterprise). */
  readonly plans = computed(() => {
    const selfService = this.selfService();
    const negotiated = (this.catalog()?.plans ?? []).filter((p) => !selfService.includes(p));
    return [...selfService, ...negotiated];
  });
  readonly currentPlan = computed(() => this.plans().find((p) => p.code === this.subscription().planCode));
  readonly selectedPlan = computed<Plan | undefined>(() => this.plans().find((p) => p.code === this.planCode()));

  readonly isCurrentNegotiated = computed(() => !this.isSelfService(this.currentPlan()));
  /** Negotiated plans are set by accepting a quote, not from here. */
  readonly isSelectedNegotiated = computed(() => !!this.selectedPlan() && !this.isSelfService(this.selectedPlan()));
  readonly planChanged = computed(() => this.planCode() !== this.subscription().planCode);
  /** Moving off Enterprise ends its negotiated prices and yearly billing. */
  readonly leavesContract = computed(() => this.planChanged() && this.isCurrentNegotiated() && !this.isSelectedNegotiated());

  readonly target = computed(() => purchasableAddOns(this.selectedPlan(), this.wanted()));
  private readonly kept = computed(() => {
    const plan = this.selectedPlan();
    return plan ? keptAddOns(this.subscription(), plan) : [];
  });
  readonly toAdd = computed(() => this.target().filter((code) => !this.kept().includes(code)));
  readonly toRemove = computed(() => this.kept().filter((code) => !this.target().includes(code)));
  /** Active add-ons the new plan includes or stops selling: the API ends them with the plan change. */
  readonly dropped = computed(() => {
    if (!this.planChanged() || this.isSelectedNegotiated()) return [];
    const kept = this.kept();
    return this.subscription().addOns.filter((a) => a.isActive && !kept.includes(a.code));
  });
  readonly hasChanges = computed(
    () => !this.isSelectedNegotiated() && (this.planChanged() || this.toAdd().length > 0 || this.toRemove().length > 0),
  );

  /** Today's monthly fee; null when negotiated (the quote holds it). */
  readonly currentFee = computed(() => {
    const plan = this.currentPlan();
    if (!plan || this.isCurrentNegotiated()) return null;
    return monthlyFee(plan, this.subscription().addOns.filter((a) => a.isActive).map((a) => a.code));
  });
  readonly newFee = computed(() => {
    const plan = this.selectedPlan();
    return plan && !this.isSelectedNegotiated() ? monthlyFee(plan, this.target()) : null;
  });
  readonly saveLabel = computed(() => {
    const plan = this.selectedPlan();
    if (this.planChanged() && plan) return `Cambiar a ${planName(plan)}`;
    return 'Guardar complementos';
  });

  constructor() {
    this.loadCatalog();
  }

  loadCatalog(): void {
    this.isLoadingCatalog.set(true);
    this.catalogError.set(false);
    this.catalogService
      .getCatalog()
      .pipe(
        finalize(() => this.isLoadingCatalog.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (catalog) => this.catalog.set(catalog),
        error: () => this.catalogError.set(true),
      });
  }

  isSelfService(plan: Plan | undefined): boolean {
    return !!plan && this.selfService().includes(plan);
  }

  isCurrent(plan: Plan): boolean {
    return plan.code === this.subscription().planCode;
  }

  pickPlan(code: PlanCode): void {
    if (this.isSaving()) return;
    this.planCode.set(code);
  }

  /** Back to what the client has today. */
  reset(): void {
    this.planCode.set(this.subscription().planCode);
    this.wanted.set(this.subscription().addOns.filter((a) => a.isActive).map((a) => a.code));
  }

  toggleAddOn(code: AddOnCode): void {
    if (this.isSaving()) return;
    this.wanted.update((current) => (current.includes(code) ? current.filter((c) => c !== code) : [...current, code]));
  }

  isAddOnWanted(code: AddOnCode): boolean {
    return this.wanted().includes(code);
  }

  /** Plan first, so add-ons are checked against the plan they end up on. */
  save(): void {
    const plan = this.selectedPlan();
    if (this.isSaving() || !plan || !this.hasChanges()) return;
    if (this.planChanged() && !confirm(this.confirmMessage(plan))) return;

    const id = this.clientId();
    const steps: Array<() => Observable<ClientSubscription>> = [
      ...(this.planChanged() ? [() => this.clientsService.changePlan(id, plan.code)] : []),
      ...this.toAdd().map((code) => () => this.clientsService.addAddOn(id, code)),
      ...this.toRemove().map((code) => () => this.clientsService.removeAddOn(id, code)),
    ];
    this.isSaving.set(true);
    from(steps)
      .pipe(
        concatMap((step) => step()),
        last(),
        finalize(() => this.isSaving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (subscription) => {
          this.notificationService.success(`Plan ${planLabel(subscription.planCode)} actualizado.`, 'Suscripción');
          this.saved.emit();
        },
        error: (error) => {
          this.notificationService.apiError(error, 'No se pudo actualizar la suscripción.');
          this.refresh.emit();
        },
      });
  }

  cancelSubscription(): void {
    if (this.isSaving()) return;
    if (!confirm('¿Cancelar la suscripción? El laboratorio pierde de inmediato el plan y los módulos que se venden aparte.')) return;
    this.isSaving.set(true);
    this.clientsService
      .cancelSubscription(this.clientId())
      .pipe(
        finalize(() => this.isSaving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.notificationService.success('Suscripción cancelada.', 'Suscripción');
          this.saved.emit();
        },
        error: (error) => this.notificationService.apiError(error, 'No se pudo cancelar la suscripción.'),
      });
  }

  private confirmMessage(plan: Plan): string {
    const from = this.currentPlan() ? planName(this.currentPlan()!) : planLabel(this.subscription().planCode);
    const lines = [`¿Cambiar el plan de ${from} a ${planName(plan)}? El cambio aplica de inmediato.`];
    if (this.leavesContract()) lines.push('Terminan las condiciones negociadas y la facturación pasa a mensual.');
    if (this.dropped().length) lines.push(`Terminan: ${this.dropped().map((a) => a.name).join(', ')}.`);
    return lines.join('\n\n');
  }
}
