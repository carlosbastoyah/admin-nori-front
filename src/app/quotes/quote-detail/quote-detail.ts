import { Component, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, switchMap } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { NotificationService } from '@nori/core';
import { QuotesService } from '../quotes.service';
import { ClientsService } from '../../clients/clients.service';
import { ActivateOnboardingRequest, Quote } from '../models/quote.models';
import { badgeClass, planLabel, quoteStatusLabel, quoteStatusTone } from '../../shared/utils/labels.util';
import { formatMXN } from '../../shared/utils/format.util';

@Component({
  selector: 'app-quote-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './quote-detail.html',
})
export class QuoteDetail implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly quotesService = inject(QuotesService);
  private readonly clientsService = inject(ClientsService);
  private readonly notificationService = inject(NotificationService);
  private readonly destroy$ = new Subject<void>();

  quote: Quote | null = null;
  isLoading = true;
  notFound = false;
  isAccepting = false;
  isApplying = false;

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

  get canAccept(): boolean {
    return this.quote?.status === 'Draft' || this.quote?.status === 'Sent';
  }

  get canApplyToSubscription(): boolean {
    return !!this.quote && this.quote.status === 'Accepted' && !!this.quote.clientId;
  }

  get canActivateOnboarding(): boolean {
    return !!this.quote && this.quote.status === 'Accepted' && !this.quote.clientId;
  }

  accept(): void {
    if (!this.quote) return;
    this.isAccepting = true;
    this.quotesService
      .accept(this.quote.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (quote) => {
          this.quote = quote;
          this.isAccepting = false;
          this.notificationService.success('Cotización aceptada.', 'Listo');
        },
        error: (error) => {
          this.isAccepting = false;
          this.notificationService.apiError(error, 'No se pudo aceptar la cotización.');
        },
      });
  }

  applyToSubscription(): void {
    if (!this.quote?.clientId) return;
    this.isApplying = true;
    this.clientsService
      .applyQuote(this.quote.clientId, this.quote.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.isApplying = false;
          this.notificationService.success('La suscripción del cliente fue actualizada.', 'Listo');
          this.router.navigate(['/clients', this.quote!.clientId]);
        },
        error: (error) => {
          this.isApplying = false;
          this.notificationService.apiError(error, 'No se pudo aplicar la cotización a la suscripción.');
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
