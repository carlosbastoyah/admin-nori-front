import { Component, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, switchMap } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { NotificationService } from '@nori/core';
import { QuotesService } from '../quotes.service';
import { ActivateOnboardingRequest, Quote } from '../models/quote.models';
import { badgeClass, planLabel, quoteStatusLabel, quoteStatusTone } from '../../shared/utils/labels.util';
import { formatMXN } from '../../shared/utils/format.util';
import { BackLink } from '../../shared/directives/back-link.directive';

@Component({
  selector: 'app-quote-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, BackLink],
  templateUrl: './quote-detail.html',
})
export class QuoteDetail implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly quotesService = inject(QuotesService);
  private readonly notificationService = inject(NotificationService);
  private readonly destroy$ = new Subject<void>();

  quote: Quote | null = null;
  isLoading = true;
  notFound = false;
  isAccepting = false;

  showOnboardingForm = false;
  isActivatingOnboarding = false;
  onboarding: ActivateOnboardingRequest = {
    quoteId: '',
    clientName: '',
    clientCode: '',
    adminEmail: '',
    adminName: '',
    adminPassword: '',
  };

  readonly badgeClass = badgeClass;
  readonly planLabel = planLabel;
  readonly quoteStatusLabel = quoteStatusLabel;
  readonly quoteStatusTone = quoteStatusTone;
  readonly formatMXN = formatMXN;

  constructor() {
    this.route.paramMap
      .pipe(
        switchMap((params) => {
          this.isLoading = true;
          this.notFound = false;
          return this.quotesService.getById(params.get('id') ?? '');
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (quote) => {
          this.quote = quote;
          this.isLoading = false;
          this.onboarding.quoteId = quote.id;
          this.onboarding.clientName = quote.prospectName ?? '';
        },
        error: (error) => {
          this.isLoading = false;
          this.notFound = true;
          this.notificationService.apiError(error, 'No se pudo cargar la cotización.');
        },
      });
  }

  private get isOpen(): boolean {
    return this.quote?.status === 'Draft' || this.quote?.status === 'Sent';
  }

  /** Draft and sent quotes can still change; accepted ones are history. */
  get canEdit(): boolean {
    return this.isOpen;
  }

  /** Partner approval only matters before the quote is accepted. */
  get showPartnerApprovalNotice(): boolean {
    return this.isOpen && !!this.quote?.requiresPartnerApproval;
  }

  /** Accepting a client's quote replaces that client's subscription with the quoted plan. */
  get canAccept(): boolean {
    return this.isOpen && !!this.quote?.clientId;
  }

  /** A prospect's quote becomes a client and its subscription in one step; the API refuses accepted quotes. */
  get canActivateOnboarding(): boolean {
    return this.isOpen && !this.quote?.clientId;
  }

  accept(): void {
    if (!this.quote) return;
    if (!confirm(`¿Aplicar ${this.quote.planName} a ${this.quote.clientName ?? 'el cliente'}? Su suscripción actual se reemplaza de inmediato.`)) return;
    this.isAccepting = true;
    this.quotesService
      .accept(this.quote.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (quote) => {
          this.quote = quote;
          this.isAccepting = false;
          this.notificationService.success('La suscripción del cliente fue actualizada.', 'Listo');
          this.router.navigate(['/clients', quote.clientId]);
        },
        error: (error) => {
          this.isAccepting = false;
          this.notificationService.apiError(error, 'No se pudo aplicar la cotización.');
        },
      });
  }

  openOnboardingForm(): void {
    this.showOnboardingForm = true;
  }

  cancelOnboardingForm(): void {
    this.showOnboardingForm = false;
  }

  activateOnboarding(): void {
    if (!this.quote) return;
    this.isActivatingOnboarding = true;
    this.quotesService
      .activateOnboarding(this.onboarding)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.isActivatingOnboarding = false;
          this.notificationService.success('Cliente activado correctamente.', 'Listo');
          this.router.navigate(['/clients', response.clientId]);
        },
        error: (error) => {
          this.isActivatingOnboarding = false;
          this.notificationService.apiError(error, 'No se pudo activar el cliente.');
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
