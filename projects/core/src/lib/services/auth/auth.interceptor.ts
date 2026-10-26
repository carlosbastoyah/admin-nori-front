import { Injectable } from '@angular/core';
import {
    HttpContextToken,
    HttpRequest,
    HttpHandler,
    HttpEvent,
    HttpInterceptor,
    HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { AuthService } from './auth.service';

/** Marks a request already retried after a refresh, so a second 401 is final instead of looping. */
const RETRIED_AFTER_REFRESH = new HttpContextToken<boolean>(() => false);

/**
 * Adds the Bearer token and, on a 401, refreshes it once and retries the request. Concurrent 401s share one refresh
 * (AuthService keeps it in flight); a request that failed with a token another refresh already replaced is retried
 * with the new one without refreshing again. Whether a failed refresh ends the session is AuthService's call.
 */
@Injectable()
export class AuthInterceptor implements HttpInterceptor {
    constructor(private readonly authService: AuthService) { }

    intercept(
        request: HttpRequest<unknown>,
        next: HttpHandler
    ): Observable<HttpEvent<unknown>> {
        // Login, refresh and logout carry their own credentials and must never trigger a refresh themselves:
        // a 401 from logout used to start a refresh, whose failure logged out again, and so on.
        if (this.isAuthEndpoint(request)) {
            return next.handle(request);
        }

        const sentToken = this.authService.getToken();
        const outgoing = sentToken ? this.addToken(request, sentToken) : request;

        return next.handle(outgoing).pipe(
            catchError((error: unknown) => {
                if (this.statusOf(error) !== 401 || request.context.get(RETRIED_AFTER_REFRESH) || !sentToken) {
                    return throwError(() => error);
                }
                return this.retryWithFreshToken(request, next, sentToken, error);
            })
        );
    }

    private retryWithFreshToken(
        request: HttpRequest<unknown>,
        next: HttpHandler,
        sentToken: string,
        originalError: unknown
    ): Observable<HttpEvent<unknown>> {
        const retry = (token: string) =>
            next.handle(this.addToken(request.clone({ context: request.context.set(RETRIED_AFTER_REFRESH, true) }), token));

        // Another request (or another tab) refreshed while this one was in flight: use that token.
        const current = this.authService.getToken();
        if (current && current !== sentToken) {
            return retry(current);
        }

        return this.authService.refreshToken().pipe(
            catchError(() => throwError(() => originalError)),
            switchMap((response) => retry(response.accessToken))
        );
    }

    private addToken(request: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
        return request.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
    }

    private statusOf(error: unknown): number | undefined {
        return error instanceof HttpErrorResponse ? error.status : (error as { status?: number })?.status;
    }

    private isAuthEndpoint(request: HttpRequest<unknown>): boolean {
        return /auth\/(login|refresh|logout)(\?|$)/.test(request.url);
    }
}
