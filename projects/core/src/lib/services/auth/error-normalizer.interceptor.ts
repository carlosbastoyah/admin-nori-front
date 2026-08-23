import { Injectable } from '@angular/core';
import {
    HttpRequest,
    HttpHandler,
    HttpEvent,
    HttpInterceptor,
    HttpErrorResponse,
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { normalizeHttpError, isApiError } from '../../models/api-error';
import { ConfigService } from '../config.service';

@Injectable()
export class ErrorNormalizerInterceptor implements HttpInterceptor {
    constructor(private readonly configService: ConfigService) {}

    intercept(
        request: HttpRequest<unknown>,
        next: HttpHandler
    ): Observable<HttpEvent<unknown>> {
        return next.handle(request).pipe(
            catchError((err: unknown) => {
                if (isApiError(err)) {
                    return throwError(() => err);
                }
                if (err instanceof HttpErrorResponse && err.status >= 400) {
                    const normalized = normalizeHttpError(err);
                    if (
                        this.configService.enableLogging &&
                        normalized.traceId
                    ) {
                        console.error(
                            `[API Error] ${normalized.code} - ${normalized.detail}`,
                            { traceId: normalized.traceId, status: normalized.status }
                        );
                    }
                    return throwError(() => normalized);
                }
                return throwError(() => err);
            })
        );
    }
}
