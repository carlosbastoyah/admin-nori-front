import { Component, OnDestroy, inject } from '@angular/core';
import { CommonModule, formatDate } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, switchMap } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { NotificationService } from '@nori/core';
import { ClientsService } from '../clients.service';
import { QuotesService } from '../../quotes/quotes.service';
import { Client, ClientSubscription } from '../models/client.models';
import { Quote } from '../../quotes/models/quote.models';
import { badgeClass, planLabel, quoteStatusLabel, quoteStatusTone, subscriptionStatusLabel, subscriptionStatusTone } from '../../shared/utils/labels.util';
import { formatMXN } from '../../shared/utils/format.util';
import { BackLink } from '../../shared/directives/back-link.directive';
import { ClientPlanEditor } from '../client-plan-editor/client-plan-editor';
import { CatalogService } from '../../catalog/catalog.service';
import { Catalog } from '../../catalog/models/catalog.models';
import { ClientBillingService } from '../client-billing.service';
import { ClientBillingProfile } from '../models/billing.models';
import { ClientBillingProfileCard } from '../client-billing-profile/client-billing-profile';
import { ClientPayments, PaymentsSummary } from '../client-payments/client-payments';

export type ClientTab = 'summary' | 'payments' | 'quotes';

@Component({
  selector: 'app-client-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, ClientPlanEditor, BackLink, ClientBillingProfileCard, ClientPayments],
  templateUrl: './client-detail.html',
})
export class ClientDetail implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly clientsService = inject(ClientsService);
  private readonly quotesService = inject(QuotesService);
  private readonly catalogService = inject(CatalogService);
  private readonly notificationService = inject(NotificationService);
  private readonly billingService = inject(ClientBillingService);
  private readonly destroy$ = new Subject<void>();

  client: Client | null = null;
  subscription: ClientSubscription | null = null;
  quotes: Quote[] = [];
  isLoading = true;
  isLoadingSubscription = false;
  isEditingPlan = false;
  catalog: Catalog | null = null;
  notFound = false;

  tab: ClientTab = 'summary';
  billingProfile: ClientBillingProfile | null = null;
  paymentsSummary: PaymentsSummary | null = null;
  /** Bumped to make the payments tab reload its periods. */
  paymentsReloadKey = 0;

  isEditingStartDate = false;
  isSavingStartDate = false;
  startDateDraft = '';

  readonly badgeClass = badgeClass;
  readonly planLabel = planLabel;
  readonly subscriptionStatusLabel = subscriptionStatusLabel;
  readonly subscriptionStatusTone = subscriptionStatusTone;
  readonly quoteStatusLabel = quoteStatusLabel;
  readonly quoteStatusTone = quoteStatusTone;
  readonly formatMXN = formatMXN;

  constructor() {
    this.catalogService
      .getCatalog()
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: (catalog) => (this.catalog = catalog), error: () => (this.catalog = null) });

    this.route.paramMap
      .pipe(
        switchMap((params) => {
          const id = params.get('id') ?? '';
          const tab = this.route.snapshot.queryParamMap.get('tab');
          this.tab = tab === 'payments' || tab === 'quotes' ? tab : 'summary';
          this.isLoading = true;
          this.notFound = false;
          return this.clientsService.getById(id);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (client) => {
          this.client = client;
          this.isLoading = false;
          this.loadSubscription(client.id);
          this.loadQuotes(client.id);
          this.loadBillingProfile(client.id);
        },
        error: (error) => {
          this.isLoading = false;
          this.notFound = true;
          this.notificationService.apiError(error, 'No se pudo cargar el cliente.');
        },
      });
  }

  /** Modules the plan includes plus the ones bought apart. */
  get modules(): Array<{ name: string; included: boolean }> {
    if (!this.subscription) return [];
    const plan = this.catalog?.plans?.find((p) => p.code === this.subscription!.planCode);
    const included = (plan?.addOnRules ?? [])
      .filter((r) => r.availability === 'Included')
      .map((r) => ({ code: r.addOnCode, name: r.addOnName, included: true }));
    const bought = this.subscription.addOns
      .filter((a) => a.isActive && !included.some((i) => i.code === a.code))
      .map((a) => ({ code: a.code, name: a.name, included: false }));
    return [...included, ...bought];
  }

  selectTab(tab: ClientTab): void {
    this.tab = tab;
    // Kept in the URL so a reload or the back button returns to the same tab.
    this.router.navigate([], { relativeTo: this.route, queryParams: { tab: tab === 'summary' ? null : tab }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  onPaymentsSummary(summary: PaymentsSummary): void {
    // Emitted from the child's effect; deferred so this page's bindings are not changed mid-check.
    Promise.resolve().then(() => (this.paymentsSummary = summary));
  }

  editStartDate(): void {
    if (!this.subscription) return;
    // The day as the admin sees it in the page, not the UTC day of the stored moment.
    this.startDateDraft = formatDate(this.subscription.startedAt, 'yyyy-MM-dd', 'en-US');
    this.isEditingStartDate = true;
  }

  saveStartDate(): void {
    if (!this.client || !this.startDateDraft) return;
    if (this.subscription && this.startDateDraft === formatDate(this.subscription.startedAt, 'yyyy-MM-dd', 'en-US')) {
      this.isEditingStartDate = false;
      return;
    }
    if (this.startDateDraft > formatDate(new Date(), 'yyyy-MM-dd', 'en-US')
      && !confirm('La fecha de inicio es futura: no habrá periodos por cobrar hasta entonces. ¿Continuar?')) return;
    this.isSavingStartDate = true;
    this.billingService
      .changeStartDate(this.client.id, this.startDateDraft)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (subscription) => {
          this.subscription = subscription;
          this.isSavingStartDate = false;
          this.isEditingStartDate = false;
          this.paymentsReloadKey++;
          this.notificationService.success('Fecha de inicio actualizada. Los periodos se recalcularon.', 'Listo');
        },
        error: (error) => {
          this.isSavingStartDate = false;
          this.notificationService.apiError(error, 'No se pudo cambiar la fecha de inicio.');
        },
      });
  }

  newQuote(): void {
    if (!this.client) return;
    this.router.navigate(['/quotes/new'], { queryParams: { clientId: this.client.id } });
  }

  openQuote(quote: Quote): void {
    this.router.navigate(['/quotes', quote.id]);
  }

  /** After the plan editor saved: close it and show what the API now has. */
  onPlanSaved(): void {
    this.isEditingPlan = false;
    if (this.client) this.loadSubscription(this.client.id);
  }

  reloadSubscription(): void {
    if (this.client) this.loadSubscription(this.client.id);
  }

  private loadSubscription(clientId: string): void {
    this.isLoadingSubscription = true;
    this.clientsService
      .getSubscription(clientId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (subscription) => {
          this.subscription = subscription;
          this.isLoadingSubscription = false;
        },
        error: () => {
          this.subscription = null;
          this.isEditingPlan = false;
          this.isLoadingSubscription = false;
        },
      });
  }

  private loadBillingProfile(clientId: string): void {
    this.billingService
      .getProfile(clientId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (profile) => (this.billingProfile = profile),
        error: () => (this.billingProfile = null),
      });
  }

  private loadQuotes(clientId: string): void {
    this.quotesService
      .list({ clientId })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (quotes) => (this.quotes = quotes),
        error: () => (this.quotes = []),
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
