import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { HttpService } from '@nori/core';
import { Catalog, CompareFilters, ComparePlansResponse } from './models/catalog.models';

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly http = inject(HttpService);
  private readonly base = '/administration/admin/subscriptions';

  getCatalog(): Observable<Catalog> {
    return this.http.get<Catalog>(`${this.base}/catalog`);
  }

  comparePlans(filters: CompareFilters): Observable<ComparePlansResponse> {
    let params = new HttpParams().set('cases', filters.cases);
    if (filters.cfdiStamps != null) params = params.set('cfdiStamps', filters.cfdiStamps);
    if (filters.storageExtraGb != null) params = params.set('storageExtraGb', filters.storageExtraGb);
    if (filters.billingAddOn != null) params = params.set('billingAddOn', filters.billingAddOn);
    if (filters.inventoryAddOn != null) params = params.set('inventoryAddOn', filters.inventoryAddOn);
    return this.http.get<ComparePlansResponse>(`${this.base}/plans/compare`, params);
  }
}
