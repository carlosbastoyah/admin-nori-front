import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { normalizeHttpError, isApiError } from '../models/api-error';
import { ConfigService } from './config.service';

export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    message?: string;
    errors?: any;
}

@Injectable({
    providedIn: 'root'
})
export class HttpService {
    constructor(
        private readonly http: HttpClient,
        private readonly config: ConfigService
    ) { }

    private get apiUrl(): string {
        return this.config.apiUrl;
    }

    get<T>(endpoint: string, params?: HttpParams): Observable<T> {
        return this.http.get<T>(`${this.apiUrl}${endpoint}`, { params }).pipe(
            catchError(this.handleError)
        );
    }

    post<T>(endpoint: string, body: any): Observable<T> {
        return this.http.post<T>(`${this.apiUrl}${endpoint}`, body).pipe(
            catchError(this.handleError)
        );
    }

    put<T>(endpoint: string, body: any): Observable<T> {
        return this.http.put<T>(`${this.apiUrl}${endpoint}`, body).pipe(
            catchError(this.handleError)
        );
    }

    patch<T>(endpoint: string, body: any): Observable<T> {
        return this.http.patch<T>(`${this.apiUrl}${endpoint}`, body).pipe(
            catchError(this.handleError)
        );
    }

    delete<T>(endpoint: string): Observable<T> {
        return this.http.delete<T>(`${this.apiUrl}${endpoint}`).pipe(
            catchError(this.handleError)
        );
    }

    private handleError(error: HttpErrorResponse | unknown): Observable<never> {
        if (isApiError(error)) {
            return throwError(() => error);
        }
        if (error instanceof HttpErrorResponse) {
            const normalized = normalizeHttpError(error);
            return throwError(() => normalized);
        }
        return throwError(() => error);
    }
}
