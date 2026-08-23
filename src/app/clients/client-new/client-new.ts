import { Component, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { NotificationService } from '@nori/core';
import { ClientsService } from '../clients.service';

@Component({
  selector: 'app-client-new',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './client-new.html',
})
export class ClientNew implements OnDestroy {
  private readonly clientsService = inject(ClientsService);
  private readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly destroy$ = new Subject<void>();

  name = '';
  code = '';
  isActive = true;
  isSaving = false;
  touched = false;

  get isValid(): boolean {
    return this.name.trim().length > 0 && this.code.trim().length > 0;
  }

  save(): void {
    this.touched = true;
    if (!this.isValid) return;

    this.isSaving = true;
    this.clientsService
      .create({ name: this.name.trim(), code: this.code.trim(), isActive: this.isActive })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (client) => {
          this.isSaving = false;
          this.notificationService.success('Cliente creado correctamente.', 'Listo');
          this.router.navigate(['/clients', client.id]);
        },
        error: (error) => {
          this.isSaving = false;
          this.notificationService.apiError(error, 'No se pudo crear el cliente.');
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
