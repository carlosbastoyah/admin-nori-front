export type NotificationType = 'error' | 'success' | 'warning' | 'info';
export type NotificationPosition = 'top-right' | 'bottom-right';

export interface INotification {
  id: string;
  type: NotificationType;
  title?: string;
  message: string;
  duration?: number;
  dismissible?: boolean;
}
