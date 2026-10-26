import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, forkJoin, from, map, mergeMap, of, switchMap, toArray } from 'rxjs';
import { ClientsService } from '../clients/clients.service';
import { ClientBillingService } from '../clients/client-billing.service';
import { Client } from '../clients/models/client.models';
import { BillingPeriod, Prefactura } from '../clients/models/billing.models';

/** A prefactura with the client it charges, so lists across clients can show and link it. */
export interface PrefacturaRow extends Prefactura {
  clientName: string;
  clientCode: string;
}

/** Months without prefactura of one client. */
export interface ClientPendingPeriods {
  client: Client;
  periods: BillingPeriod[];
}

export interface BillingOverview {
  clients: Client[];
  prefacturas: PrefacturaRow[];
  pending: ClientPendingPeriods[];
  /** Clients whose billing could not be read; their numbers are missing from the totals. */
  failedClients: Client[];
  loadedAt: Date;
}

/** Requests in flight at once when reading every client's billing. */
const CONCURRENCY = 6;
const PAGE_SIZE = 100;
/** A result older than this is read again in the background when a page asks for it. */
const STALE_MS = 60_000;

/**
 * Billing of every client at once, for the dashboard and the payments page. The API only answers per client, so this
 * reads the client list and then each subscribed client's prefacturas and periods; the result is kept until reloaded.
 */
@Injectable({ providedIn: 'root' })
export class BillingOverviewService {
  private readonly clientsService = inject(ClientsService);
  private readonly billingService = inject(ClientBillingService);

  readonly overview = signal<BillingOverview | null>(null);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  /**
   * Reads everything unless a recent result is at hand; an older one stays on screen while the new one loads, since
   * prefacturas also change from each client's page.
   */
  load(force = false): void {
    const loadedAt = this.overview()?.loadedAt.getTime();
    if (this.isLoading() || (!force && loadedAt && Date.now() - loadedAt < STALE_MS)) return;
    this.isLoading.set(true);
    this.error.set(null);
    this.fetch().subscribe({
      next: (overview) => {
        this.overview.set(overview);
        this.isLoading.set(false);
      },
      error: (error) => {
        this.isLoading.set(false);
        this.error.set(error?.detail || error?.message || 'No se pudieron cargar los datos de facturación.');
      },
    });
  }

  /** Puts a prefactura changed elsewhere (paid, issued) into the loaded overview without reading everything again. */
  replace(updated: Prefactura): void {
    const current = this.overview();
    if (!current) return;
    this.overview.set({
      ...current,
      prefacturas: current.prefacturas.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)),
    });
  }

  private fetch(): Observable<BillingOverview> {
    return this.allClients().pipe(
      switchMap((clients) => {
        const billed = clients.filter((c) => c.subscription);
        return from(billed).pipe(
          mergeMap(
            (client) =>
              forkJoin({
                prefacturas: this.billingService.list(client.id),
                periods: this.billingService.listPeriods(client.id),
              }).pipe(
                map((result) => ({ client, ...result, failed: false })),
                catchError(() => of({ client, prefacturas: [] as Prefactura[], periods: [] as BillingPeriod[], failed: true })),
              ),
            CONCURRENCY,
          ),
          toArray(),
          map((results) => ({
            clients,
            prefacturas: results.flatMap((r) =>
              r.prefacturas.map((p) => ({ ...p, clientName: r.client.name, clientCode: r.client.code })),
            ),
            pending: results
              .map((r) => ({ client: r.client, periods: r.periods.filter((p) => !p.invoiceId) }))
              .filter((r) => r.periods.length > 0),
            failedClients: results.filter((r) => r.failed).map((r) => r.client),
            loadedAt: new Date(),
          })),
        );
      }),
    );
  }

  /** Every client, page after page (the API caps a page at 100). */
  private allClients(): Observable<Client[]> {
    return this.clientsService.list({ pageNumber: 1, pageSize: PAGE_SIZE }).pipe(
      switchMap((first) => {
        if (first.totalPages <= 1) return of(first.items);
        const rest = Array.from({ length: first.totalPages - 1 }, (_, i) =>
          this.clientsService.list({ pageNumber: i + 2, pageSize: PAGE_SIZE }).pipe(map((page) => page.items)),
        );
        return forkJoin(rest).pipe(map((pages) => [first.items, ...pages].flat()));
      }),
    );
  }
}
