import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { BackLink } from '../../shared/directives/back-link.directive';
import { finalize } from 'rxjs/operators';
import { NotificationService } from '@nori/core';
import { CatalogService } from '../../catalog/catalog.service';
import { Catalog, Plan } from '../../catalog/models/catalog.models';
import { AddOnCode, PlanCode } from '../../shared/models/shared.models';
import { formatMXN } from '../../shared/utils/format.util';
import { ClientsService } from '../clients.service';
import {
  AVAILABLE_KINDS,
  ClientDraft,
  DraftErrors,
  DraftField,
  EMPTY_DRAFT,
  FormStep,
  KIND_LABEL,
  LaboratoryKind,
  SPECIALTY_MAX,
  WIZARD_STEPS,
  WizardStep,
  addOnPrice,
  blockerBefore,
  codeFromName,
  collapseSpaces,
  createFailure,
  draftErrors,
  generatePassword,
  includedAddOns,
  monthlyFee,
  optionalAddOns,
  passwordStrength,
  planName,
  purchasableAddOns,
  selfServicePlans,
  stepBlocked,
  stepOf,
  toCreateClientRequest,
} from './client-new.model';

type TextField = 'specialty' | 'name' | 'code' | 'adminName' | 'adminEmail' | 'adminPassword';

const STEP_COPY: Record<WizardStep, { title: string; heading: string; desc: string }> = {
  type: {
    title: 'Tipo',
    heading: '¿Qué tipo de laboratorio es?',
    desc: 'Define el catálogo inicial: estudios, categorías, plantillas de informe y tipos de caso.',
  },
  plan: {
    title: 'Plan',
    heading: 'Plan de prueba',
    desc: 'El cliente empieza con 30 días de prueba sin costo. Enterprise se aplica después desde una cotización.',
  },
  lab: {
    title: 'Laboratorio',
    heading: 'Datos del laboratorio',
    desc: 'El nombre aparece en informes y tickets. El código identifica al laboratorio en Nori y nombra su base de datos.',
  },
  admin: {
    title: 'Administrador',
    heading: 'Usuario administrador',
    desc: 'Con esta cuenta el laboratorio entra a Nori e invita al resto de su equipo.',
  },
  review: {
    title: 'Revisión',
    heading: 'Revisa lo que se va a crear',
    desc: 'Se crea la base de datos del laboratorio, su catálogo y el usuario administrador.',
  },
};

const KINDS: ReadonlyArray<{ kind: LaboratoryKind; desc: string; chip: string }> = [
  { kind: 'pathology', desc: 'Histopatología, citología, inmunohistoquímica y biología molecular.', chip: 'Biopsias · Citologías' },
  { kind: 'clinical', desc: 'Química sanguínea, hematología, uroanálisis y microbiología.', chip: 'Próximamente' },
  { kind: 'other', desc: 'Genética, toxicología u otra especialidad.', chip: 'Catálogo de patología' },
];

const STRENGTH_LABEL = ['', 'Débil', 'Aceptable', 'Fuerte'] as const;

@Component({
  selector: 'app-client-new',
  standalone: true,
  imports: [CommonModule, FormsModule, BackLink],
  templateUrl: './client-new.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientNew {
  private readonly clientsService = inject(ClientsService);
  private readonly catalogService = inject(CatalogService);
  private readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly steps = WIZARD_STEPS;
  readonly stepCopy = STEP_COPY;
  readonly kinds = KINDS;
  readonly kindLabel = KIND_LABEL;
  readonly availableKinds = AVAILABLE_KINDS;
  readonly specialtyMax = SPECIALTY_MAX;
  readonly strengthLabel = STRENGTH_LABEL;
  readonly formatMXN = formatMXN;
  readonly planName = planName;
  readonly addOnPrice = addOnPrice;
  readonly optionalAddOns = optionalAddOns;
  readonly includedAddOns = includedAddOns;

  readonly draft = signal<ClientDraft>(EMPTY_DRAFT);
  readonly step = signal<WizardStep>('type');
  /** Steps the admin tried to leave: their errors become visible. */
  private readonly tried = signal<ReadonlySet<FormStep>>(new Set());
  /** Errors the API reported for a field; dropped as soon as the field changes. */
  private readonly serverErrors = signal<DraftErrors>({});
  readonly failure = signal<string | null>(null);
  readonly isSaving = signal(false);
  readonly showPassword = signal(false);

  readonly catalog = signal<Catalog | null>(null);
  readonly isLoadingCatalog = signal(true);
  readonly catalogError = signal(false);

  readonly errors = computed<DraftErrors>(() => ({ ...draftErrors(this.draft()), ...this.serverErrors() }));
  readonly plans = computed(() => selfServicePlans(this.catalog()));
  readonly selectedPlan = computed<Plan | undefined>(() => this.plans().find((p) => p.code === this.draft().planCode));
  readonly stepIndex = computed(() => this.steps.indexOf(this.step()));
  readonly canCreate = computed(() => !blockerBefore(this.errors(), 'review'));
  readonly strength = computed(() => passwordStrength(this.draft().adminPassword));
  readonly fee = computed(() => {
    const plan = this.selectedPlan();
    return plan ? monthlyFee(plan, this.draft().addOnCodes) : null;
  });
  readonly purchasedAddOnNames = computed(() => {
    const plan = this.selectedPlan();
    const codes = purchasableAddOns(plan, this.draft().addOnCodes);
    return plan ? plan.addOnRules.filter((r) => codes.includes(r.addOnCode)).map((r) => r.addOnName) : [];
  });
  readonly specialtyLabel = computed(() => collapseSpaces(this.draft().specialty));

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

  /** Error under a field: once its step was attempted, or right away when the API sent it. */
  errorFor(field: DraftField): string | undefined {
    if (!this.tried().has(stepOf(field)) && !this.serverErrors()[field]) return undefined;
    return this.errors()[field];
  }

  canJumpTo(target: WizardStep): boolean {
    return !this.isSaving() && target !== this.step() && !blockerBefore(this.errors(), target);
  }

  pickKind(kind: LaboratoryKind): void {
    if (!AVAILABLE_KINDS.has(kind)) return;
    this.patch({ kind });
  }

  pickPlan(code: PlanCode): void {
    this.patch({ planCode: code });
    this.clearServerErrors(['plan']);
  }

  toggleAddOn(code: AddOnCode): void {
    const current = this.draft().addOnCodes;
    this.patch({ addOnCodes: current.includes(code) ? current.filter((c) => c !== code) : [...current, code] });
  }

  isAddOnWanted(code: AddOnCode): boolean {
    return this.draft().addOnCodes.includes(code);
  }

  edit(field: TextField, value: string): void {
    const next: Partial<ClientDraft> = { [field]: value };
    const draft = this.draft();
    if (field === 'name' && !draft.codeEdited) next.code = codeFromName(value);
    if (field === 'code') {
      const code = value.toLowerCase();
      // Clearing the code hands it back to the name.
      next.codeEdited = code !== '';
      next.code = code || codeFromName(draft.name);
    }
    this.patch(next);
    // A new name also rewrites the code, so a "code taken" error goes with it.
    this.clearServerErrors(field === 'name' ? ['name', 'code'] : [field]);
  }

  fillPassword(): void {
    this.edit('adminPassword', generatePassword());
    this.showPassword.set(true);
  }

  next(): void {
    const step = this.step();
    if (step === 'review') return;
    this.tried.update((tried) => new Set(tried).add(step));
    if (stepBlocked(step, this.errors())) return;
    this.step.set(this.steps[this.stepIndex() + 1]);
  }

  back(): void {
    if (this.isSaving() || this.stepIndex() === 0) return;
    this.step.set(this.steps[this.stepIndex() - 1]);
  }

  goTo(target: WizardStep): void {
    if (this.isSaving()) return;
    const blocker = blockerBefore(this.errors(), target);
    if (blocker) {
      this.tried.update((tried) => new Set(tried).add(blocker));
      this.step.set(blocker);
      return;
    }
    this.step.set(target);
  }

  create(): void {
    if (this.isSaving()) return;
    if (!this.canCreate()) {
      this.goTo('review');
      return;
    }
    this.isSaving.set(true);
    this.failure.set(null);
    this.clientsService
      .create(toCreateClientRequest(this.draft(), this.selectedPlan()))
      .pipe(
        finalize(() => this.isSaving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (created) => {
          const trial = created.trialEndsAt
            ? ` Prueba hasta el ${new Date(created.trialEndsAt).toLocaleDateString('es-MX')}.`
            : '';
          this.notificationService.success(`${created.name} quedó listo.${trial}`, 'Cliente creado');
          this.router.navigate(['/clients', created.clientId], { replaceUrl: true });
        },
        error: (err) => {
          const { step, field, message } = createFailure(err);
          this.step.set(step);
          if (field) {
            this.serverErrors.update((errors) => ({ ...errors, [field]: message }));
          } else {
            this.failure.set(message);
          }
        },
      });
  }

  private patch(changes: Partial<ClientDraft>): void {
    if (this.isSaving()) return;
    this.draft.update((draft) => ({ ...draft, ...changes }));
  }

  private clearServerErrors(fields: ReadonlyArray<DraftField>): void {
    const current = this.serverErrors();
    if (!fields.some((f) => f in current)) return;
    const next = { ...current };
    for (const f of fields) delete next[f];
    this.serverErrors.set(next);
  }
}
