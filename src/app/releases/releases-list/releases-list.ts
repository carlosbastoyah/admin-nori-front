import { Component, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { NotificationService } from '@nori/core';
import { ReleasesService } from '../releases.service';
import { DesktopRelease, DesktopReleaseStatus } from '../models/desktop-release.models';
import { BadgeTone, badgeClass } from '../../shared/utils/labels.util';

const STATUS_LABELS: Record<DesktopReleaseStatus, string> = {
  draft: 'Borrador',
  published: 'Publicada',
  withdrawn: 'Retirada',
};

const STATUS_TONES: Record<DesktopReleaseStatus, BadgeTone> = {
  draft: 'info',
  published: 'ok',
  withdrawn: 'neutral',
};

const PLATFORM_LABELS: Record<string, string> = {
  'darwin-aarch64': 'macOS (Apple Silicon)',
  'darwin-x86_64': 'macOS (Intel)',
  'windows-x86_64': 'Windows x64',
  'windows-aarch64': 'Windows ARM',
};

@Component({
  selector: 'app-releases-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './releases-list.html',
})
export class ReleasesList implements OnDestroy {
  private readonly releasesService = inject(ReleasesService);
  private readonly notificationService = inject(NotificationService);
  private readonly destroy$ = new Subject<void>();

  items: DesktopRelease[] = [];
  isLoading = false;
  errorMessage = '';
  /** Release with an action in flight; its buttons are disabled. */
  busyId: string | null = null;
  editingId: string | null = null;
  notesDraft = '';

  readonly badgeClass = badgeClass;

  constructor() {
    this.load();
  }

  get latestPublished(): DesktopRelease | undefined {
    return this.items.find((r) => r.status === 'published');
  }

  statusLabel(status: DesktopReleaseStatus): string {
    return STATUS_LABELS[status] ?? status;
  }

  statusTone(status: DesktopReleaseStatus): BadgeTone {
    return STATUS_TONES[status] ?? 'neutral';
  }

  platformLabel(platform: string): string {
    return PLATFORM_LABELS[platform] ?? platform;
  }

  sizeLabel(bytes: number | null): string {
    return bytes == null ? '' : `${(bytes / 1048576).toFixed(1)} MB`;
  }

  canPublish(release: DesktopRelease): boolean {
    return release.status !== 'published' && !release.filesDeletedAt && release.assets.length > 0;
  }

  publish(release: DesktopRelease): void {
    const mandatory = release.isMandatory ? ' Está marcada como OBLIGATORIA: los usuarios no podrán seguir sin reiniciar.' : '';
    if (!confirm(`¿Publicar Nori ${release.version}? Las apps instaladas la descargarán en su próxima revisión.${mandatory}`)) {
      return;
    }
    this.run(release, this.releasesService.publish(release.id), `Nori ${release.version} publicada.`);
  }

  withdraw(release: DesktopRelease): void {
    const fallback = release.status === 'published' ? ' Las apps volverán a ofrecer la versión publicada anterior.' : '';
    if (!confirm(`¿Retirar Nori ${release.version}?${fallback}`)) {
      return;
    }
    this.run(release, this.releasesService.withdraw(release.id), `Nori ${release.version} retirada.`);
  }

  toggleMandatory(release: DesktopRelease): void {
    const next = !release.isMandatory;
    const message = next ? `Nori ${release.version} ahora es obligatoria.` : `Nori ${release.version} ya no es obligatoria.`;
    this.run(release, this.releasesService.update(release.id, { isMandatory: next }), message);
  }

  startEditNotes(release: DesktopRelease): void {
    this.editingId = release.id;
    this.notesDraft = release.notes ?? '';
  }

  cancelEditNotes(): void {
    this.editingId = null;
    this.notesDraft = '';
  }

  saveNotes(release: DesktopRelease): void {
    this.run(release, this.releasesService.update(release.id, { notes: this.notesDraft }), 'Notas guardadas.', () =>
      this.cancelEditNotes(),
    );
  }

  private run(release: DesktopRelease, request: Observable<DesktopRelease>, success: string, done?: () => void): void {
    this.busyId = release.id;
    request.pipe(takeUntil(this.destroy$)).subscribe({
      next: (updated) => {
        this.busyId = null;
        this.items = this.items.map((r) => (r.id === updated.id ? updated : r));
        this.notificationService.success(success);
        done?.();
        // Withdrawing can free the installers of older releases.
        if (updated.status === 'withdrawn') this.load();
      },
      error: (error) => {
        this.busyId = null;
        this.notificationService.apiError(error, 'No se pudo completar la acción.');
        // Resyncs controls that changed optimistically (the mandatory checkbox).
        this.load();
      },
    });
  }

  private load(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.releasesService
      .list()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (items) => {
          this.items = items;
          this.isLoading = false;
        },
        error: (error) => {
          this.isLoading = false;
          this.errorMessage = 'No se pudieron cargar las versiones.';
          this.notificationService.apiError(error, this.errorMessage);
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
