import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { INotification, NotificationPosition } from '../../models/notification';
import { NotificationService } from '../../services/notification.service';
import { Notification } from '../notification/notification';

@Component({
  selector: 'nori-notifications-container',
  standalone: true,
  imports: [CommonModule, Notification],
  templateUrl: './notifications-container.html',
})
export class NotificationsContainer implements OnInit, OnDestroy {
  notifications: INotification[] = [];
  position: NotificationPosition = 'top-right';
  private readonly maxVisible = 5;
  private subscription?: Subscription;
  private positionSubscription?: Subscription;

  constructor(private readonly notificationService: NotificationService) {}

  ngOnInit(): void {
    this.subscription = this.notificationService.notifications$.subscribe((notifications) => {
      this.notifications = notifications.slice(-this.maxVisible);
    });

    this.positionSubscription = this.notificationService.position$.subscribe((position) => {
      this.position = position;
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    this.positionSubscription?.unsubscribe();
  }

  onDismiss(id: string): void {
    this.notificationService.remove(id);
  }
}
