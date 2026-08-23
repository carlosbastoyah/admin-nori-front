import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { HttpService } from '@nori/core';
import { Client, ClientFilters, ClientSubscription, CreateClientRequest, PagedClients } from './models/client.models';
import { Quote } from '../quotes/models/quote.models';

@Injectable({ providedIn: 'root' })
export class ClientsService {
  private readonly http = inject(HttpService);
  private readonly base = '/administration/admin/clients';

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

  create(request: CreateClientRequest): Observable<Client> {
    return this.http.post<Client>(this.base, request);
  }

  getSubscription(clientId: string): Observable<ClientSubscription> {
    return this.http.get<ClientSubscription>(`${this.base}/${clientId}/subscription`);
  }

  applyQuote(clientId: string, quoteId: string): Observable<Quote> {
    return this.http.post<Quote>(`${this.base}/${clientId}/subscription/apply-quote`, { quoteId });
  }
}
