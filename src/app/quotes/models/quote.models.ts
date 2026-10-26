import { AddOnCode, PlanCode, QuoteStatus } from '../../shared/models/shared.models';

/** Only Enterprise may pay yearly; every other plan bills monthly. */
export type BillingCycle = 'Monthly' | 'Annual';

export interface EnterpriseTerms {
  negotiatedBasePrice: number;
  negotiatedCaseUnitPrice: number;
  negotiatedCfdiStampPrice: number;
  storageIncludedGb: number;
  storageBlockSizeGb?: number;
  storageBlockPrice?: number;
  billingIncluded?: boolean;
  inventoryIncluded?: boolean;
  analyticsIncluded?: boolean;
  billingCycle?: BillingCycle;
  /** Fraction off the subtotal, e.g. 0.1 for 10%. */
  discountPercent?: number;
  /** Yearly increase from the second contract year, e.g. 0.05 for 5%. */
  annualIncreasePercent?: number;
}

export interface QuoteInput {
  planCode: PlanCode;
  estimatedCases: number;
  estimatedCfdiStamps: number;
  estimatedStorageExtraGb: number;
  selectedAddOnCodes?: AddOnCode[];
  enterpriseTerms?: EnterpriseTerms;
}

export interface CreateQuoteRequest extends QuoteInput {
  clientId?: string;
  prospectName?: string;
  validUntil?: string;
  notes?: string;
}

export interface QuoteLine {
  lineType: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  sortOrder: number;
}

export interface QuotePricing {
  planCode: PlanCode;
  planName: string;
  pricingModel: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  taxRate: number;
  requiresPartnerApproval: boolean;
  lineItems: QuoteLine[];
  billingCycle: BillingCycle;
}

export interface Quote {
  id: string;
  clientId?: string;
  clientName?: string;
  prospectName?: string;
  planCode: PlanCode;
  planName: string;
  status: QuoteStatus;
  estimatedCases: number;
  estimatedCfdiStamps: number;
  estimatedStorageExtraGb: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  taxRate: number;
  requiresPartnerApproval: boolean;
  validUntil?: string;
  notes?: string;
  createdAt: string;
  selectedAddOnCodes: AddOnCode[];
  lineItems: QuoteLine[];
  billingCycle: BillingCycle;
  enterpriseTerms?: EnterpriseTerms;
}

export interface QuoteFilters {
  status?: QuoteStatus;
  clientId?: string;
  planCode?: PlanCode;
}

export interface ActivateOnboardingRequest {
  quoteId: string;
  clientName: string;
  clientCode: string;
  adminEmail: string;
  adminName: string;
  adminPassword: string;
}

export interface ActivateOnboardingResponse {
  clientId: string;
  clientCode: string;
  databaseName: string;
  quoteId: string;
  mainUserId: string;
}
