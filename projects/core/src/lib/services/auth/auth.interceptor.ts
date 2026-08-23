import { Injectable } from '@angular/core';
import {
    HttpRequest,
    HttpHandler,
    HttpEvent,
    HttpInterceptor,
    HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError, Subject } from 'rxjs';
import { catchError, switchMap, take } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { isApiError } from '../../models/api-error';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
    private isRefreshing = false;
    private tokenSubject = new Subject<string | null>();

    constructor(private readonly authService: AuthService) { }

    intercept(
        request: HttpRequest<unknown>,
        next: HttpHandler
    ): Observable<HttpEvent<unknown>> {
        const token = this.authService.getToken();
        if (token && !this.isAuthBypassEndpoint(request)) {
            request = this.addToken(request, token);
        }

        return next.handle(request).pipe(
            catchError((error: unknown) => {
                const status = error instanceof HttpErrorResponse
                    ? error.status
                    : (error as { status?: number })?.status;
                if (status === 401) {
                    if (this.isLoginEndpoint(request)) {
                        return throwError(() => error);
                    }
                    return this.handle401Error(request, next, error);
                }
                return throwError(() => error);
            })
        );
    }

    private addToken(
        request: HttpRequest<unknown>,
        token: string
    ): HttpRequest<unknown> {
        return request.clone({
            setHeaders: {
                Authorization: `Bearer ${token}`
            }
        });
    }

    private isRefreshEndpoint(request: HttpRequest<unknown>): boolean {
        return request.url.includes('auth/refresh');
    }

    private isLoginEndpoint(request: HttpRequest<unknown>): boolean {
        return request.url.includes('auth/login');
    }

    private isAuthBypassEndpoint(request: HttpRequest<unknown>): boolean {
        return this.isLoginEndpoint(request);
    }

    private handle401Error(
        request: HttpRequest<unknown>,
        next: HttpHandler,
        originalError: unknown
    ): Observable<HttpEvent<unknown>> {
        if (this.isRefreshEndpoint(request)) {
            this.authService.logout().subscribe();
            return throwError(() => originalError);
        }

        if (isApiError(originalError) && originalError.code === 'INVALID_OR_EXPIRED_TOKEN') {
            this.authService.logout().subscribe();
            return throwError(() => originalError);
        }

        if (!this.isRefreshing) {
            this.isRefreshing = true;
            this.tokenSubject = new Subject<string | null>();

            this.authService.refreshToken().subscribe({
                next: (response) => {
                    const newToken = response?.accessToken;
                    if (newToken) {
                        this.tokenSubject.next(newToken);
                    } else {
                        this.tokenSubject.next(null);
                    }
                    this.tokenSubject.complete();
                    this.isRefreshing = false;
                },
                error: () => {
                    this.tokenSubject.next(null);
                    this.tokenSubject.complete();
                    this.isRefreshing = false;
                    this.authService.logout().subscribe();
                }
            });
        }

        return this.tokenSubject.pipe(
            take(1),
            switchMap((newToken) => {
                if (!newToken) {
                    return throwError(() => originalError);
                }
                return next.handle(this.addToken(request, newToken));
            })
        );
    }
}
