/** New-client wizard: draft, validation and the `POST administration/clients` contract (same rules as the desktop signup). */
import { ApiError, isApiError } from '@nori/core';
import { Catalog, Plan, PlanAddOnRule } from '../../catalog/models/catalog.models';
import { AddOnCode, PlanCode } from '../../shared/models/shared.models';
import { CreateClientRequest, LaboratoryType } from '../models/client.models';

export type LaboratoryKind = 'pathology' | 'clinical' | 'other';

export const FORM_STEPS = ['type', 'plan', 'lab', 'admin'] as const;
export type FormStep = (typeof FORM_STEPS)[number];
export type WizardStep = FormStep | 'review';
export const WIZARD_STEPS: ReadonlyArray<WizardStep> = [...FORM_STEPS, 'review'];

export interface ClientDraft {
  kind: LaboratoryKind | null;
  specialty: string;
  planCode: PlanCode | null;
  /** Add-ons wanted whatever the plan; the request sends only the ones the plan sells apart. */
  addOnCodes: AddOnCode[];
  name: string;
  code: string;
  /** The code was typed by hand; it no longer follows the name. */
  codeEdited: boolean;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
}

export const EMPTY_DRAFT: ClientDraft = {
  kind: null,
  specialty: '',
  planCode: null,
  addOnCodes: [],
  name: '',
  code: '',
  codeEdited: false,
  adminName: '',
  adminEmail: '',
  adminPassword: '',
};

export const KIND_LABEL: Record<LaboratoryKind, string> = {
  pathology: 'Patología',
  clinical: 'Laboratorio clínico',
  other: 'Otro',
};

/** Laboratory types the API can seed today; clinical labs wait for their catalog. */
export const AVAILABLE_KINDS: ReadonlySet<LaboratoryKind> = new Set<LaboratoryKind>(['pathology', 'other']);

const API_KIND: Record<LaboratoryKind, LaboratoryType> = {
  pathology: 'Pathology',
  clinical: 'ClinicalLab',
  other: 'Other',
};

export const CODE_PATTERN = /^[a-z0-9_]{3,40}$/;
export const PASSWORD_MIN = 10;
export const SPECIALTY_MAX = 100;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type DraftField =
  | 'kind'
  | 'specialty'
  | 'plan'
  | 'name'
  | 'code'
  | 'adminName'
  | 'adminEmail'
  | 'adminPassword';
export type DraftErrors = Partial<Record<DraftField, string>>;

const STEP_FIELDS: Record<FormStep, ReadonlyArray<DraftField>> = {
  type: ['kind', 'specialty'],
  plan: ['plan'],
  lab: ['name', 'code'],
  admin: ['adminName', 'adminEmail', 'adminPassword'],
};

export function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Tenant code derived from the name: lowercase ASCII, words joined by `_`. */
export function codeFromName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
    .replace(/_+$/, '');
}

export function draftErrors(draft: ClientDraft): DraftErrors {
  const errors: DraftErrors = {};
  if (!draft.kind || !AVAILABLE_KINDS.has(draft.kind)) errors.kind = 'Elige el tipo de laboratorio.';
  if (draft.kind === 'other' && collapseSpaces(draft.specialty).length > SPECIALTY_MAX) {
    errors.specialty = `La especialidad no puede superar ${SPECIALTY_MAX} caracteres.`;
  }
  if (!draft.planCode) errors.plan = 'Elige un plan.';
  if (collapseSpaces(draft.name).length < 3) errors.name = 'Escribe el nombre del laboratorio (mínimo 3 caracteres).';
  if (!draft.code) errors.code = 'Escribe un código.';
  else if (!CODE_PATTERN.test(draft.code)) errors.code = 'De 3 a 40 caracteres: minúsculas, números y guion bajo.';
  if (collapseSpaces(draft.adminName).length < 3) errors.adminName = 'Escribe el nombre completo del administrador.';
  if (!EMAIL_PATTERN.test(draft.adminEmail.trim())) errors.adminEmail = 'Escribe un correo válido.';
  if (draft.adminPassword.length < PASSWORD_MIN) errors.adminPassword = `Mínimo ${PASSWORD_MIN} caracteres.`;
  return errors;
}

export function stepBlocked(step: FormStep, errors: DraftErrors): boolean {
  return STEP_FIELDS[step].some((field) => errors[field]);
}

export function stepOf(field: DraftField): FormStep {
  return FORM_STEPS.find((step) => STEP_FIELDS[step].includes(field)) ?? 'type';
}

/** First form step before `target` that is still invalid. */
export function blockerBefore(errors: DraftErrors, target: WizardStep): FormStep | undefined {
  const limit = WIZARD_STEPS.indexOf(target);
  return FORM_STEPS.find((step) => WIZARD_STEPS.indexOf(step) < limit && stepBlocked(step, errors));
}

/** 0–3: none, weak, fair, strong. */
export function passwordStrength(password: string): 0 | 1 | 2 | 3 {
  if (!password) return 0;
  if (password.length < PASSWORD_MIN) return 1;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  return kinds >= 3 && password.length >= 12 ? 3 : 2;
}

/** Random password with every character class, for an admin setting up someone else's account. */
export function generatePassword(length = 14): string {
  const sets = ['abcdefghjkmnpqrstuvwxyz', 'ABCDEFGHJKMNPQRSTUVWXYZ', '23456789', '!@#$%*?-_'];
  const all = sets.join('');
  const random = (max: number) => crypto.getRandomValues(new Uint32Array(1))[0] % max;
  const chars = sets.map((set) => set[random(set.length)]);
  while (chars.length < length) chars.push(all[random(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/** Plans a client can start a trial on; Enterprise is applied later from a quote. */
export function selfServicePlans(catalog: Catalog | null): Plan[] {
  return (catalog?.plans ?? []).filter(
    (p) => p.isPublic && p.pricingModel === 'ProgressiveTiers' && p.monthlyBasePrice != null,
  );
}

/** "Nori Esencial" → "Esencial". */
export function planName(plan: Plan): string {
  return plan.name.replace(/^Nori\s+/i, '');
}

export function optionalAddOns(plan: Plan): PlanAddOnRule[] {
  return plan.addOnRules.filter((r) => r.availability === 'Optional');
}

export function includedAddOns(plan: Plan): PlanAddOnRule[] {
  return plan.addOnRules.filter((r) => r.availability === 'Included');
}

/** Monthly price after the plan's discount. */
export function addOnPrice(rule: PlanAddOnRule): number {
  return rule.listPrice * (1 - (rule.discountPercent ?? 0));
}

/** Add-on codes to send for a plan: the wanted ones it sells apart. */
export function purchasableAddOns(plan: Plan | undefined, wanted: ReadonlyArray<AddOnCode>): AddOnCode[] {
  return plan ? optionalAddOns(plan).map((r) => r.addOnCode).filter((code) => wanted.includes(code)) : [];
}

/** Monthly fee before taxes and studies: base plus the add-ons bought apart. */
export function monthlyFee(plan: Plan, wanted: ReadonlyArray<AddOnCode>): number {
  const addOns = optionalAddOns(plan)
    .filter((r) => wanted.includes(r.addOnCode))
    .reduce((total, r) => total + addOnPrice(r), 0);
  return (plan.monthlyBasePrice ?? 0) + addOns;
}

export function toCreateClientRequest(draft: ClientDraft, plan: Plan | undefined): CreateClientRequest {
  const kind = draft.kind ?? 'pathology';
  const specialty = collapseSpaces(draft.specialty);
  return {
    name: collapseSpaces(draft.name),
    code: draft.code,
    mainUser: {
      email: draft.adminEmail.trim().toLowerCase(),
      name: collapseSpaces(draft.adminName),
      password: draft.adminPassword,
    },
    laboratoryType: API_KIND[kind],
    laboratorySpecialty: kind === 'other' && specialty ? specialty : null,
    planCode: draft.planCode as PlanCode,
    addOnCodes: purchasableAddOns(plan, draft.addOnCodes),
  };
}

/** Where a failed creation sends the admin back to, and what to tell them. */
export interface CreateFailure {
  step: WizardStep;
  field?: DraftField;
  message: string;
}

/** The API answers conflicts in English; map the ones the admin can fix to a field. */
export function createFailure(err: unknown): CreateFailure {
  const error: ApiError | null = isApiError(err) ? err : null;
  if (!error) return { step: 'review', message: 'No se pudo crear el cliente.' };
  const detail = error.detail ?? '';
  if (error.status === 409 && /client with code/i.test(detail)) {
    return { step: 'lab', field: 'code', message: 'Ese código ya está en uso. Elige otro.' };
  }
  if (error.status === 409 && /user with email/i.test(detail)) {
    return { step: 'admin', field: 'adminEmail', message: 'Ya existe una cuenta con ese correo.' };
  }
  if (error.status === 400 && /\bplan\b|complemento/i.test(detail)) {
    return { step: 'plan', field: 'plan', message: detail };
  }
  if (error.status === 0) return { step: 'review', message: error.detail };
  if (error.status === 408 || error.status === 504) {
    return {
      step: 'review',
      message:
        'El servidor tardó demasiado en responder. Es posible que el cliente sí se haya creado: búscalo en la lista antes de volver a crearlo.',
    };
  }
  if (error.status === 429) return { step: 'review', message: 'Demasiados intentos. Espera unos minutos.' };
  if (error.status >= 500) return { step: 'review', message: 'No se pudo crear el cliente. Intenta de nuevo en unos minutos.' };
  return { step: 'review', message: detail || 'No se pudo crear el cliente.' };
}
