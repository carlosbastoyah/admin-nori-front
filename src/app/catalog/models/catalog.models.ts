import { AddOnAvailability, AddOnCode, PlanCode } from '../../shared/models/shared.models';

export interface PlanAddOnRule {
  addOnCode: AddOnCode;
  addOnName: string;
  availability: AddOnAvailability;
  listPrice: number;
  discountPercent?: number;
}

/** What a plan counts to charge the month: each study (catalogs v1/v2) or each case, whatever its studies (v3). */
export type UsageUnit = 'Study' | 'Case';

/** How screens name a plan's unit; an API without the field still counts studies. */
export function unitWords(unit: UsageUnit | undefined): { one: string; many: string; Many: string } {
  return unit === 'Case'
    ? { one: 'caso', many: 'casos', Many: 'Casos' }
    : { one: 'estudio', many: 'estudios', Many: 'Estudios' };
}

/** Every plan of a catalog counts the same unit. */
export function catalogUnitWords(catalog: Catalog | null | undefined) {
  return unitWords(catalog?.plans[0]?.usageUnit);
}

export interface Plan {
  code: PlanCode;
  name: string;
  description?: string;
  pricingModel: string;
  isPublic: boolean;
  monthlyBasePrice?: number;
  storageIncludedGb?: number;
  usageUnit?: UsageUnit;
  /** Units (`usageUnit`) the monthly fee covers; absent when the catalog bills studies by tiers. */
  includedStudies?: number;
  extraStudyPrice?: number;
  supportLevel: string;
  analyticsLevel: string;
  cfdiStampUnitPrice?: number;
  addOnRules: PlanAddOnRule[];
}

export interface CaseTier {
  tierOrder: number;
  fromCaseCount: number;
  toCaseCount?: number;
  unitPrice: number;
  requiresNegotiation: boolean;
}

export interface CatalogAddOn {
  code: AddOnCode;
  name: string;
  description?: string;
}

export interface Catalog {
  catalogCode: string;
  catalogName: string;
  effectiveFrom: string;
  plans: Plan[];
  caseTiers: CaseTier[];
  addOns: CatalogAddOn[];
}

export interface CompareFilters {
  cases: number;
  cfdiStamps?: number;
  storageExtraGb?: number;
  billingAddOn?: boolean;
  inventoryAddOn?: boolean;
}

export interface PlanCompare {
  planCode: PlanCode;
  planName: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  isCheapest: boolean;
}

export interface ComparePlansResponse {
  catalogCode: string;
  plans: PlanCompare[];
  cheapestPlanCode: PlanCode;
}
