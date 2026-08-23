import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { HttpService } from '@nori/core';
import {
  ActivateOnboardingRequest,
  ActivateOnboardingResponse,
  CreateQuoteRequest,
  Quote,
  QuoteFilters,
  QuoteInput,
  QuotePricing,
} from './models/quote.models';

@Injectable({ providedIn: 'root' })
export class QuotesService {
  private readonly http = inject(HttpService);
  private readonly base = '/administration/admin/quotes';
  private readonly onboardingBase = '/administration/admin/onboarding';

  preview(input: QuoteInput): Observable<QuotePricing> {
    return this.http.post<QuotePricing>(`${this.base}/preview`, input);
  }

  create(request: CreateQuoteRequest): Observable<Quote> {
    return this.http.post<Quote>(this.base, request);
  }

  list(filters: QuoteFilters): Observable<Quote[]> {
    let params = new HttpParams();
    if (filters.status) params = params.set('status', filters.status);
    if (filters.clientId) params = params.set('clientId', filters.clientId);
    if (filters.planCode) params = params.set('planCode', filters.planCode);
    return this.http.get<Quote[]>(this.base, params);
  }

  getById(quoteId: string): Observable<Quote> {
    return this.http.get<Quote>(`${this.base}/${quoteId}`);
  }

  accept(quoteId: string): Observable<Quote> {
    return this.http.post<Quote>(`${this.base}/${quoteId}/accept`, {});
  }

  activateOnboarding(request: ActivateOnboardingRequest): Observable<ActivateOnboardingResponse> {
    return this.http.post<ActivateOnboardingResponse>(`${this.onboardingBase}/activate`, request);
  }
}
