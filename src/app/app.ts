import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NotificationsContainer } from '@nori/core';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NotificationsContainer],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {}
