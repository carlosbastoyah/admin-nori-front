import { AddOnCode, BillingCycle, PlanCode, SubscriptionStatus } from '../../shared/models/shared.models';

export interface ClientSubscriptionSummary {
  planCode: PlanCode;
  planName: string;
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  startedAt: string;
}

/** Catalog the API seeds the lab with; `ClinicalLab` waits for its catalog. */
export type LaboratoryType = 'Pathology' | 'ClinicalLab' | 'Other';

export interface Client {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  createdAt: string;
  subscription: ClientSubscriptionSummary | null;
  laboratoryType?: LaboratoryType;
  laboratorySpecialty?: string | null;
}

export interface PagedClients {
  items: Client[];
  totalCount: number;
  pageNumber: number;
  pageSize: number;
  totalPages: number;
}

export interface CreateClientMainUser {
  email: string;
  name: string;
  password: string;
}

/** `POST administration/clients`: provisions the lab database, seeds its catalog and starts a trial. */
export interface CreateClientRequest {
  name: string;
  code: string;
  mainUser: CreateClientMainUser;
  laboratoryType: LaboratoryType;
  laboratorySpecialty: string | null;
  /** Self-service plan of the trial; Enterprise goes through a quote once the client exists. */
  planCode: PlanCode;
  /** Only add-ons the plan sells apart; included ones are ignored by the API. */
  addOnCodes: AddOnCode[];
}

export interface CreateClientResponse {
  clientId: string;
  name: string;
  code: string;
  databaseName: string;
  mainUserId: string | null;
  /** ISO date the free trial ends. */
  trialEndsAt: string | null;
}

export interface ClientFilters {
  pageNumber?: number;
  pageSize?: number;
  search?: string;
  isActive?: boolean;
  planCode?: PlanCode;
  subscriptionStatus?: SubscriptionStatus;
  hasSubscription?: boolean;
}

export interface ClientSubscriptionAddOn {
  code: AddOnCode;
  name: string;
  monthlyPrice: number;
  isActive: boolean;
}

export interface ClientSubscription {
  id: string;
  clientId: string;
  planCode: PlanCode;
  planName: string;
  catalogCode: string;
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  startedAt: string;
  addOns: ClientSubscriptionAddOn[];
}
