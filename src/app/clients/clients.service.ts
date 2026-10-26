import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { HttpService } from '@nori/core';
import {
  Client,
  ClientFilters,
  ClientSubscription,
  CreateClientRequest,
  CreateClientResponse,
  PagedClients,
} from './models/client.models';
import { Quote } from '../quotes/models/quote.models';
import { AddOnCode, PlanCode } from '../shared/models/shared.models';

@Injectable({ providedIn: 'root' })
export class ClientsService {
  private readonly http = inject(HttpService);
  private readonly base = '/administration/admin/clients';
  /** The admin API only reads clients; creating one goes through the signup endpoint the desktop app uses. */
  private readonly signupUrl = '/administration/clients';

  list(filters: ClientFilters): Observable<PagedClients> {
    let params = new HttpParams();
    if (filters.pageNumber != null) params = params.set('pageNumber', filters.pageNumber);
    if (filters.pageSize != null) params = params.set('pageSize', filters.pageSize);
    if (filters.search) params = params.set('search', filters.search);
    if (filters.isActive != null) params = params.set('isActive', filters.isActive);
    if (filters.planCode) params = params.set('planCode', filters.planCode);
    if (filters.subscriptionStatus) params = params.set('subscriptionStatus', filters.subscriptionStatus);
    if (filters.hasSubscription != null) params = params.set('hasSubscription', filters.hasSubscription);
    return this.http.get<PagedClients>(this.base, params);
  }

  getById(clientId: string): Observable<Client> {
    return this.http.get<Client>(`${this.base}/${clientId}`);
  }

  create(request: CreateClientRequest): Observable<CreateClientResponse> {
    return this.http.post<CreateClientResponse>(this.signupUrl, request);
  }

  getSubscription(clientId: string): Observable<ClientSubscription> {
    return this.http.get<ClientSubscription>(`${this.base}/${clientId}/subscription`);
  }

  /** Self-service plans only; add-ons the new plan no longer sells apart are dropped by the API. */
  changePlan(clientId: string, planCode: PlanCode): Observable<ClientSubscription> {
    return this.http.put<ClientSubscription>(`${this.base}/${clientId}/subscription/plan`, { planCode });
  }

  addAddOn(clientId: string, addOnCode: AddOnCode): Observable<ClientSubscription> {
    return this.http.post<ClientSubscription>(`${this.base}/${clientId}/subscription/add-ons`, { addOnCode });
  }

  removeAddOn(clientId: string, addOnCode: AddOnCode): Observable<ClientSubscription> {
    return this.http.delete<ClientSubscription>(`${this.base}/${clientId}/subscription/add-ons/${addOnCode}`);
  }

  cancelSubscription(clientId: string): Observable<ClientSubscription> {
    return this.http.post<ClientSubscription>(`${this.base}/${clientId}/subscription/cancel`, {});
  }

  applyQuote(clientId: string, quoteId: string): Observable<Quote> {
    return this.http.post<Quote>(`${this.base}/${clientId}/subscription/apply-quote`, { quoteId });
  }
}
