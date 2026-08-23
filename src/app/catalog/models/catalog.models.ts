import { AddOnAvailability, AddOnCode, PlanCode } from '../../shared/models/shared.models';

export interface PlanAddOnRule {
  addOnCode: AddOnCode;
  addOnName: string;
  availability: AddOnAvailability;
  listPrice: number;
  discountPercent?: number;
}

export interface Plan {
  code: PlanCode;
  name: string;
  description?: string;
  pricingModel: string;
  isPublic: boolean;
  monthlyBasePrice?: number;
  storageIncludedGb?: number;
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
