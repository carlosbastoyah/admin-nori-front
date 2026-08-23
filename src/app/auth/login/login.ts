import { Component, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  AuthService,
  LoginRequest,
  NotificationService,
  ErrorMappingService,
  isApiError,
} from '@nori/core';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login implements OnDestroy {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly notificationService = inject(NotificationService);
  private readonly errorMapping = inject(ErrorMappingService);

  readonly currentYear = new Date().getFullYear();

  readonly loginForm = this.formBuilder.group({
    email: ['', [Validators.required]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    rememberMe: [false],
  });

  showPassword = false;
  isLoading = false;
  errorMessage = '';

  private returnUrl = '/dashboard';
  private readonly destroy$ = new Subject<void>();

  constructor() {
    const param = this.route.snapshot.queryParams['returnUrl'];
    if (param && typeof param === 'string') {
      this.returnUrl = param.startsWith('/') ? param : `/${param}`;
    }
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.loginForm.get(fieldName);
    return !!(field && field.invalid && field.touched);
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  onSubmit(): void {
    this.errorMessage = '';

    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;

    const credentials: LoginRequest = {
      email: this.loginForm.get('email')?.value ?? '',
      password: this.loginForm.get('password')?.value ?? '',
    };

    this.authService
      .login(credentials)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.isLoading = false;
          this.notificationService.success('Inicio de sesión exitoso', 'Bienvenido');
          this.router.navigateByUrl(this.returnUrl);
        },
        error: (error) => {
          this.isLoading = false;
          this.handleLoginError(error);
        },
      });
  }

  private handleLoginError(error: unknown): void {
    if (isApiError(error)) {
      this.errorMessage =
        error.status === 401
          ? 'Usuario o contraseña incorrectos.'
          : this.errorMapping.getMessage(error);
      this.notificationService.error(this.errorMessage, 'Error de autenticación');
      return;
    }
    const status = (error as { status?: number })?.status;
    if (status === 401) {
      this.errorMessage = 'Usuario o contraseña incorrectos.';
    } else if (status === 0) {
      this.errorMessage = 'No se puede conectar con el servidor. Verifica tu conexión.';
    } else {
      this.errorMessage = 'Error al iniciar sesión. Intenta nuevamente más tarde.';
    }
    this.notificationService.error(this.errorMessage, 'Error de autenticación');
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
