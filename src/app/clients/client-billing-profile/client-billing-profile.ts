import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { NotificationService } from '@nori/core';
import { ClientBillingService } from '../client-billing.service';
import { ClientBillingProfile } from '../models/billing.models';
import { TAX_REGIMES, taxRegimeLabel } from '../../shared/utils/labels.util';

/** The lab as receptor of the prefacturas: razón social, RFC, C.P. and régimen. */
@Component({
  selector: 'app-client-billing-profile',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './client-billing-profile.html',
})
export class ClientBillingProfileCard {
  private readonly billingService = inject(ClientBillingService);
  private readonly notificationService = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly clientId = input.required<string>();
  readonly clientName = input.required<string>();
  readonly profile = input<ClientBillingProfile | null>(null);
  readonly saved = output<ClientBillingProfile>();

  readonly isEditing = signal(false);
  readonly isSaving = signal(false);
  readonly taxRegimes = TAX_REGIMES;
  readonly taxRegimeLabel = taxRegimeLabel;

  form: ClientBillingProfile = this.empty();

  edit(): void {
    const current = this.profile();
    this.form = current ? { ...current } : { ...this.empty(), legalName: this.clientName() };
    this.isEditing.set(true);
  }

  save(): void {
    this.isSaving.set(true);
    this.billingService
      .saveProfile(this.clientId(), this.form)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (profile) => {
          this.isSaving.set(false);
          this.isEditing.set(false);
          this.notificationService.success('Datos fiscales guardados.', 'Listo');
          this.saved.emit(profile);
        },
        error: (error) => {
          this.isSaving.set(false);
          this.notificationService.apiError(error, 'No se pudieron guardar los datos fiscales.');
        },
      });
  }

  private empty(): ClientBillingProfile {
    return { legalName: '', rfc: '', taxRegime: '601', postalCode: '', city: '', cfdiUse: 'G03', billingEmail: '' };
  }
}
