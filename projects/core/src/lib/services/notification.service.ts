import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { INotification, NotificationPosition, NotificationType } from '../models/notification';
import { isApiError } from '../models/api-error';

@Injectable({
    providedIn: 'root'
})
export class NotificationService {
    private readonly notificationsSubject = new BehaviorSubject<INotification[]>([]);
    public readonly notifications$: Observable<INotification[]> = this.notificationsSubject.asObservable();
    private readonly positionSubject = new BehaviorSubject<NotificationPosition>('top-right');
    public readonly position$: Observable<NotificationPosition> = this.positionSubject.asObservable();

    private generateId(): string {
        return `notification-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    }

    show(type: NotificationType, message: string, title?: string, duration?: number | null): void {
        const id = this.generateId();

        let defaultDuration: number | null = null;
        if (duration === undefined) {
            switch (type) {
                case 'error':
                    defaultDuration = 5000;
                    break;
                case 'success':
                    defaultDuration = 3000;
                    break;
                case 'warning':
                    defaultDuration = 4000;
                    break;
                case 'info':
                    defaultDuration = 4000;
                    break;
            }
        } else {
            defaultDuration = duration;
        }

        const notification: INotification = {
            id,
            type,
            message,
            title,
            duration: defaultDuration ?? undefined,
            dismissible: true
        };

        const currentNotifications = this.notificationsSubject.value;
        this.notificationsSubject.next([...currentNotifications, notification]);
    }

    error(message: string, title?: string, duration?: number | null): void {
        this.show('error', message, title, duration);
    }

    /**
     * Muestra un error extrayendo `detail` de ApiError automáticamente.
     * Úsalo en handlers HTTP: `this.notificationService.apiError(err, 'Mensaje alternativo')`.
     */
    apiError(err: unknown, fallback?: string, title?: string): void {
        const message = isApiError(err)
            ? (err.detail || fallback || 'Error')
            : ((err as { message?: string })?.message ?? fallback ?? 'Error');
        this.error(message, title ?? 'Error');
    }

    success(message: string, title?: string, duration?: number | null): void {
        this.show('success', message, title, duration);
    }

    warning(message: string, title?: string, duration?: number | null): void {
        this.show('warning', message, title, duration);
    }

    info(message: string, title?: string, duration?: number | null): void {
        this.show('info', message, title, duration);
    }

    remove(id: string): void {
        const currentNotifications = this.notificationsSubject.value;
        this.notificationsSubject.next(currentNotifications.filter(n => n.id !== id));
    }

    clear(): void {
        this.notificationsSubject.next([]);
    }

    setPosition(position: NotificationPosition): void {
        this.positionSubject.next(position);
    }

    getPosition(): NotificationPosition {
        return this.positionSubject.value;
    }
}
