import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { INotification, NotificationType } from '../../models/notification';

const ICON_PATHS: Record<NotificationType, string> = {
  error: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  success: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  warning: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
};

const TYPE_LABELS: Record<NotificationType, string> = {
  success: 'Éxito',
  error: 'Error',
  warning: 'Advertencia',
  info: 'Información',
};

const TYPE_CLASSES: Record<NotificationType, { border: string; iconBg: string; iconText: string; progress: string }> = {
  success: { border: 'border-l-ok', iconBg: 'bg-ok-light', iconText: 'text-ok-dark', progress: 'bg-ok' },
  error: { border: 'border-l-hi', iconBg: 'bg-hi-light', iconText: 'text-hi-dark', progress: 'bg-hi' },
  warning: { border: 'border-l-lo', iconBg: 'bg-lo-light', iconText: 'text-lo-dark', progress: 'bg-lo' },
  info: { border: 'border-l-info', iconBg: 'bg-info-light', iconText: 'text-info-dark', progress: 'bg-info' },
};

@Component({
  selector: 'nori-notification',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notification.html',
})
export class Notification implements OnInit, OnDestroy {
  @Input({ required: true }) notification!: INotification;
  @Output() dismiss = new EventEmitter<string>();

  isVisible = false;
  private timeoutId?: ReturnType<typeof setTimeout>;

  ngOnInit(): void {
    setTimeout(() => {
      this.isVisible = true;
    }, 10);

    if (this.notification.duration != null && this.notification.duration > 0) {
      this.timeoutId = setTimeout(() => {
        this.handleDismiss();
      }, this.notification.duration);
    }
  }

  ngOnDestroy(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
  }

  handleDismiss(): void {
    this.isVisible = false;
    setTimeout(() => {
      this.dismiss.emit(this.notification.id);
    }, 300);
  }

  get iconPath(): string {
    return ICON_PATHS[this.notification.type];
  }

  get typeLabel(): string {
    return TYPE_LABELS[this.notification.type];
  }

  get typeClasses() {
    return TYPE_CLASSES[this.notification.type];
  }

  get hasAutoDismiss(): boolean {
    return !!this.notification.duration && this.notification.duration > 0;
  }

  get durationMs(): number {
    return this.notification.duration ?? 0;
  }
}
