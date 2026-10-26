import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpService } from '@nori/core';
import {
  BillingPeriod,
  ClientBillingProfile,
  GeneratePrefacturaRequest,
  MarkPrefacturaPaidRequest,
  Prefactura,
  PrefacturaPreview,
  UpdatePrefacturaRequest,
} from './models/billing.models';
import { ClientSubscription } from './models/client.models';

@Injectable({ providedIn: 'root' })
export class ClientBillingService {
  private readonly http = inject(HttpService);
  private readonly base = '/administration/admin/clients';

  /** Null when the client has no fiscal data yet (204). */
  getProfile(clientId: string): Observable<ClientBillingProfile | null> {
    return this.http.get<ClientBillingProfile | null>(`${this.base}/${clientId}/billing-profile`);
  }

  saveProfile(clientId: string, profile: ClientBillingProfile): Observable<ClientBillingProfile> {
    return this.http.put<ClientBillingProfile>(`${this.base}/${clientId}/billing-profile`, profile);
  }

  /** Moves the day the service started; the periods to charge are counted from it. */
  changeStartDate(clientId: string, startDate: string): Observable<ClientSubscription> {
    return this.http.put<ClientSubscription>(`${this.base}/${clientId}/subscription/start-date`, { startDate });
  }

  listPeriods(clientId: string): Observable<BillingPeriod[]> {
    return this.http.get<BillingPeriod[]>(`${this.base}/${clientId}/billing-periods`);
  }

  list(clientId: string): Observable<Prefactura[]> {
    return this.http.get<Prefactura[]>(`${this.base}/${clientId}/prefacturas`);
  }

  get(clientId: string, invoiceId: string): Observable<Prefactura> {
    return this.http.get<Prefactura>(`${this.base}/${clientId}/prefacturas/${invoiceId}`);
  }

  preview(clientId: string, request: GeneratePrefacturaRequest): Observable<PrefacturaPreview> {
    return this.http.post<PrefacturaPreview>(`${this.base}/${clientId}/prefacturas/preview`, request);
  }

  generate(clientId: string, request: GeneratePrefacturaRequest): Observable<Prefactura> {
    return this.http.post<Prefactura>(`${this.base}/${clientId}/prefacturas`, request);
  }

  update(clientId: string, invoiceId: string, request: UpdatePrefacturaRequest): Observable<Prefactura> {
    return this.http.put<Prefactura>(`${this.base}/${clientId}/prefacturas/${invoiceId}`, request);
  }

  issue(clientId: string, invoiceId: string, dueDate: string | null): Observable<Prefactura> {
    return this.http.post<Prefactura>(`${this.base}/${clientId}/prefacturas/${invoiceId}/issue`, { dueDate });
  }

  markPaid(clientId: string, invoiceId: string, request: MarkPrefacturaPaidRequest): Observable<Prefactura> {
    return this.http.post<Prefactura>(`${this.base}/${clientId}/prefacturas/${invoiceId}/pay`, request);
  }

  revertPayment(clientId: string, invoiceId: string): Observable<Prefactura> {
    return this.http.post<Prefactura>(`${this.base}/${clientId}/prefacturas/${invoiceId}/revert-payment`, {});
  }

  cancel(clientId: string, invoiceId: string): Observable<Prefactura> {
    return this.http.post<Prefactura>(`${this.base}/${clientId}/prefacturas/${invoiceId}/cancel`, {});
  }

  delete(clientId: string, invoiceId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${clientId}/prefacturas/${invoiceId}`);
  }
}
