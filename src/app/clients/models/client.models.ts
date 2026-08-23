import { AddOnCode, BillingCycle, PlanCode, SubscriptionStatus } from '../../shared/models/shared.models';

export interface ClientSubscriptionSummary {
  planCode: PlanCode;
  planName: string;
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  startedAt: string;
}

export interface Client {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  createdAt: string;
  subscription: ClientSubscriptionSummary | null;
}

export interface PagedClients {
  items: Client[];
  totalCount: number;
  pageNumber: number;
  pageSize: number;
  totalPages: number;
}

export interface CreateClientRequest {
  name: string;
  code: string;
  isActive: boolean;
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
