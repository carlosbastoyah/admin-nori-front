import * as i0 from '@angular/core';
import { Injectable, EventEmitter, Output, Input, Component } from '@angular/core';
import * as i1 from '@angular/common/http';
import { HttpErrorResponse } from '@angular/common/http';
import { throwError, BehaviorSubject, of, Subject } from 'rxjs';
import { catchError, tap, switchMap, map, take } from 'rxjs/operators';
import * as i2 from '@angular/router';
import * as i1$1 from '@angular/common';
import { CommonModule } from '@angular/common';

const environment = {
    production: false,
    API_URL: 'https://app.wsnori.com/api',
    apiTimeout: 30000,
    enableLogging: true,
};

const DEFAULT_MESSAGES = {
    400: 'Solicitud inválida',
    401: 'No autorizado',
    403: 'Sin permiso',
    404: 'No encontrado',
    409: 'Conflicto',
    500: 'Error interno del servidor',
};
const DEFAULT_CODES = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    500: 'INTERNAL_ERROR',
};
function pascalToCamel(str) {
    if (!str || str.length === 0)
        return str;
    return str.charAt(0).toLowerCase() + str.slice(1);
}
/** Reads a string property from body in either camelCase or PascalCase (e.g. .NET APIs). */
function getStringFromBody(body, key) {
    const camel = body[key];
    if (typeof camel === 'string' && camel.length > 0)
        return camel;
    const pascal = key.charAt(0).toUpperCase() + key.slice(1);
    const pascalVal = body[pascal];
    return typeof pascalVal === 'string' && pascalVal.length > 0 ? pascalVal : undefined;
}
function isProblemDetailsBody(body) {
    if (!body || typeof body !== 'object')
        return false;
    const o = body;
    const status = o['status'];
    return ((typeof status === 'number' && status >= 400) ||
        typeof o['detail'] === 'string' ||
        typeof o['Detail'] === 'string' ||
        typeof o['title'] === 'string' ||
        typeof o['Title'] === 'string');
}
function mapValidationErrors(errors, toCamelCase) {
    if (!errors || !Array.isArray(errors) || errors.length === 0)
        return undefined;
    const map = {};
    for (const e of errors) {
        const key = toCamelCase ? pascalToCamel(e.propertyName) : e.propertyName;
        map[key] = e.errorMessage ?? '';
    }
    return map;
}
/**
 * Normalizes an HttpErrorResponse into a consistent ApiError.
 * Handles RFC 7807 bodies (detail, code, traceId, errors) and fallbacks by status.
 */
function parseErrorBody(error) {
    if (typeof error === 'string' && error.trim().startsWith('{')) {
        try {
            return JSON.parse(error);
        }
        catch {
            return error;
        }
    }
    return error;
}
function normalizeHttpError(response) {
    const status = response.status ?? 0;
    const body = parseErrorBody(response.error);
    if (status === 0) {
        return {
            status: 0,
            code: 'NETWORK_ERROR',
            detail: 'No se puede conectar con el servidor. Verifica tu conexión.',
            original: response,
        };
    }
    if (isProblemDetailsBody(body)) {
        const ext = (body['extensions'] ?? body['Extensions']);
        const code = getStringFromBody(body, 'code') ??
            (ext && getStringFromBody(ext, 'code')) ??
            getStringFromBody(body, 'title') ??
            DEFAULT_CODES[status] ??
            'UNKNOWN';
        const detail = getStringFromBody(body, 'detail') ??
            getStringFromBody(body, 'title') ??
            DEFAULT_MESSAGES[status] ??
            `Error del servidor: ${status}`;
        const traceId = getStringFromBody(body, 'traceId') ??
            (ext && getStringFromBody(ext, 'traceId'));
        const rawErrors = body['errors'] ?? body['Errors'] ?? ext?.['errors'] ?? ext?.['Errors'];
        const errors = mapValidationErrors(Array.isArray(rawErrors) ? rawErrors : undefined, true);
        return {
            status,
            code: String(code),
            detail: String(detail),
            traceId: traceId == null || traceId === '' ? undefined : traceId,
            errors,
            original: response,
        };
    }
    const code = DEFAULT_CODES[status] ?? 'UNKNOWN';
    const detail = DEFAULT_MESSAGES[status] ??
        (response.message && response.message.length > 0 ? response.message : `Error: ${status}`);
    return {
        status,
        code,
        detail,
        original: response,
    };
}
/**
 * Type guard: value has ApiError shape (normalized error).
 */
function isApiError(value) {
    if (!value || typeof value !== 'object')
        return false;
    const o = value;
    return (typeof o['status'] === 'number' &&
        typeof o['code'] === 'string' &&
        typeof o['detail'] === 'string');
}
/**
 * Applies server validation errors to form controls.
 * Use when API returns 400 with errors array (propertyName → errorMessage).
 * nameMap maps backend property names (e.g. PascalCase) to form control names (e.g. camelCase).
 */
function applyValidationErrors(form, errors, nameMap) {
    if (!errors || Object.keys(errors).length === 0)
        return;
    for (const [key, message] of Object.entries(errors)) {
        const controlName = nameMap?.[key] ?? key;
        const control = form.get(controlName);
        if (control) {
            const existing = control.errors ?? {};
            control.setErrors({ ...existing, serverError: message });
            control.markAsTouched();
        }
    }
}

class ConfigService {
    config = environment;
    get production() {
        return this.config.production;
    }
    get apiUrl() {
        return this.config.API_URL;
    }
    get apiTimeout() {
        return this.config.apiTimeout;
    }
    get enableLogging() {
        return this.config.enableLogging;
    }
    getApiEndpoint(path) {
        return `${this.apiUrl}/${path}`;
    }
    static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "20.3.29", ngImport: i0, type: ConfigService, deps: [], target: i0.ɵɵFactoryTarget.Injectable });
    static ɵprov = i0.ɵɵngDeclareInjectable({ minVersion: "12.0.0", version: "20.3.29", ngImport: i0, type: ConfigService, providedIn: 'root' });
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "20.3.29", ngImport: i0, type: ConfigService, decorators: [{
            type: Injectable,
            args: [{
                    providedIn: 'root'
                }]
        }] });

class HttpService {
    http;
    config;
    constructor(http, config) {
        this.http = http;
        this.config = config;
    }
    get apiUrl() {
        return this.config.apiUrl;
    }
    get(endpoint, params) {
        return this.http.get(`${this.apiUrl}${endpoint}`, { params }).pipe(catchError(this.handleError));
    }
    post(endpoint, body) {
        return this.http.post(`${this.apiUrl}${endpoint}`, body).pipe(catchError(this.handleError));
    }
    put(endpoint, body) {
        return this.http.put(`${this.apiUrl}${endpoint}`, body).pipe(catchError(this.handleError));
    }
    patch(endpoint, body) {
        return this.http.patch(`${this.apiUrl}${endpoint}`, body).pipe(catchError(this.handleError));
    }
    delete(endpoint) {
        return this.http.delete(`${this.apiUrl}${endpoint}`).pipe(catchError(this.handleError));
    }
    handleError(error) {
        if (isApiError(error)) {
            return throwError(() => error);
        }
        if (error instanceof HttpErrorResponse) {
            const normalized = normalizeHttpError(error);
            return throwError(() => normalized);
        }
        return throwError(() => error);
    }
    static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "20.3.29", ngImport: i0, type: HttpService, deps: [{ token: i1.HttpClient }, { token: ConfigService }], target: i0.ɵɵFactoryTarget.Injectable });
    static ɵprov = i0.ɵɵngDeclareInjectable({ minVersion: "12.0.0", version: "20.3.29", ngImport: i0, type: HttpService, providedIn: 'root' });
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "20.3.29", ngImport: i0, type: HttpService, decorators: [{
            type: Injectable,
            args: [{
                    providedIn: 'root'
                }]
        }], ctorParameters: () => [{ type: i1.HttpClient }, { type: ConfigService }] });

const CODE_MESSAGES = {
    BAD_REQUEST: 'Solicitud inválida. Verifica los datos.',
    INVALID_ID: 'Identificador inválido.',
    INVALID_CLIENT_ID: 'Cliente inválido.',
    INVALID_DATE_RANGE: 'Rango de fechas inválido.',
    INVALID_CREDENTIALS: 'Usuario o contraseña incorrectos. Verifica tus datos.',
    INVALID_OR_EXPIRED_TOKEN: 'Sesión expirada o inválida. Inicia sesión de nuevo.',
    ACCESS_TOKEN_REQUIRED: 'Se requiere token de acceso.',
    TOKEN_REVOKED: 'Sesión cerrada. Inicia sesión de nuevo.',
    TENANT_REQUIRED: 'Falta identificar el cliente. Contacta a soporte.',
    TENANT_NOT_FOUND_OR_INACTIVE: 'Cliente no encontrado o inactivo.',
    NOT_FOUND: 'No encontrado.',
    CONFLICT: 'Conflicto: la operación no pudo completarse (por ejemplo, registro duplicado).',
    INTERNAL_ERROR: 'Error interno. Intenta más tarde o contacta a soporte.',
    ADMIN_API_KEY_MISSING_OR_INVALID: 'Acceso no autorizado.',
    NETWORK_ERROR: 'No se puede conectar con el servidor. Verifica tu conexión.',
    UNAUTHORIZED: 'No autorizado. Inicia sesión de nuevo.',
    FORBIDDEN: 'No tienes permiso para realizar esta acción.',
};
const FALLBACK_BY_STATUS = {
    400: 'Datos inválidos. Verifica e intenta de nuevo.',
    401: 'Sesión inválida. Inicia sesión de nuevo.',
    403: 'No tienes permiso para esta acción.',
    404: 'No encontrado.',
    409: 'Conflicto al guardar. Verifica los datos.',
    500: 'Error del servidor. Intenta más tarde.',
};
class ErrorMappingService {
    /**
     * Returns a user-facing message for the given ApiError.
     * Prefers API detail when present; otherwise code map, then status-based fallback.
     * For INTERNAL_ERROR when using fallback, appends traceId when available for support.
     */
    getMessage(apiError) {
        if (apiError.detail && apiError.detail.trim().length > 0) {
            return apiError.detail;
        }
        const byCode = CODE_MESSAGES[apiError.code];
        if (byCode) {
            if (apiError.code === 'INTERNAL_ERROR' && apiError.traceId) {
                return `${byCode} Referencia: ${apiError.traceId}`;
            }
            return byCode;
        }
        return (FALLBACK_BY_STATUS[apiError.status] ??
            'Ocurrió un error. Intenta de nuevo.');
    }
    static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "20.3.29", ngImport: i0, type: ErrorMappingService, deps: [], target: i0.ɵɵFactoryTarget.Injectable });
    static ɵprov = i0.ɵɵngDeclareInjectable({ minVersion: "12.0.0", version: "20.3.29", ngImport: i0, type: ErrorMappingService, providedIn: 'root' });
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "20.3.29", ngImport: i0, type: ErrorMappingService, decorators: [{
            type: Injectable,
            args: [{
                    providedIn: 'root',
                }]
        }] });

class NotificationService {
    notificationsSubject = new BehaviorSubject([]);
    notifications$ = this.notificationsSubject.asObservable();
    positionSubject = new BehaviorSubject('top-right');
    position$ = this.positionSubject.asObservable();
    generateId() {
        return `notification-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    }
    show(type, message, title, duration) {
        const id = this.generateId();
        let defaultDuration = null;
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
        }
        else {
            defaultDuration = duration;
        }
        const notification = {
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
    error(message, title, duration) {
        this.show('error', message, title, duration);
    }
    /**
     * Muestra un error extrayendo `detail` de ApiError automáticamente.
     * Úsalo en handlers HTTP: `this.notificationService.apiError(err, 'Mensaje alternativo')`.
     */
    apiError(err, fallback, title) {
        const message = isApiError(err)
            ? (err.detail || fallback || 'Error')
            : (err?.message ?? fallback ?? 'Error');
        this.error(message, title ?? 'Error');
    }
    success(message, title, duration) {
        this.show('success', message, title, duration);
    }
    warning(message, title, duration) {
        this.show('warning', message, title, duration);
    }
    info(message, title, duration) {
        this.show('info', message, title, duration);
    }
    remove(id) {
        const currentNotifications = this.notificationsSubject.value;
        this.notificationsSubject.next(currentNotifications.filter(n => n.id !== id));
    }
    clear() {
        this.notificationsSubject.next([]);
    }
    setPosition(position) {
        this.positionSubject.next(position);
    }
    getPosition() {
        return this.positionSubject.value;
    }
    static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "20.3.29", ngImport: i0, type: NotificationService, deps: [], target: i0.ɵɵFactoryTarget.Injectable });
    static ɵprov = i0.ɵɵngDeclareInjectable({ minVersion: "12.0.0", version: "20.3.29", ngImport: i0, type: NotificationService, providedIn: 'root' });
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "20.3.29", ngImport: i0, type: NotificationService, decorators: [{
            type: Injectable,
            args: [{
                    providedIn: 'root'
                }]
        }] });

/** Refresh token this many seconds before it expires (per API doc recommendation). */
const REFRESH_BEFORE_EXPIRY_SECONDS = 120;
const STORAGE_KEY_EXPIRES_AT = 'auth_token_expires_at';
const STORAGE_KEY_CLIENT_CODE = 'client_code';
class AuthService {
    http;
    router;
    config;
    static apiURL = 'administration/auth';
    currentUserSubject;
    currentUser$;
    isAuthenticatedSubject;
    isAuthenticated$;
    refreshTimerId = null;
    constructor(http, router, config) {
        this.http = http;
        this.router = router;
        this.config = config;
        const storedUser = this.getStoredUser();
        this.currentUserSubject = new BehaviorSubject(storedUser);
        this.currentUser$ = this.currentUserSubject.asObservable();
        this.isAuthenticatedSubject = new BehaviorSubject(!!localStorage.getItem('auth_token'));
        this.isAuthenticated$ = this.isAuthenticatedSubject.asObservable();
        this.scheduleProactiveRefreshFromStoredExpiry();
    }
    login(credentials) {
        return this.http
            .post(`${this.config.getApiEndpoint(AuthService.apiURL)}/login`, credentials)
            .pipe(tap((response) => {
            this.setToken(response.accessToken);
            const user = this.authResponseToCurrentUser(response);
            this.currentUserSubject.next(user);
            this.saveUserToStorage(user);
            this.isAuthenticatedSubject.next(true);
            this.scheduleProactiveRefresh(response.expiresInSeconds);
        }), switchMap((response) => this.getMe().pipe(map(() => response), catchError(() => of(response)))));
    }
    logout() {
        const accessToken = this.getToken();
        const clearAndRedirect = () => {
            this.clearProactiveRefresh();
            this.clearStorage();
            this.currentUserSubject.next(null);
            this.isAuthenticatedSubject.next(false);
            this.router.navigate(['/login']);
        };
        if (!accessToken) {
            clearAndRedirect();
            return of(void 0);
        }
        return this.http
            .post(`${this.config.getApiEndpoint(AuthService.apiURL)}/logout`, { accessToken }, { responseType: 'text' })
            .pipe(map(() => void 0), tap(() => clearAndRedirect()), catchError(() => {
            clearAndRedirect();
            return of(void 0);
        }));
    }
    refreshToken() {
        const accessToken = this.getToken();
        if (!accessToken) {
            return throwError(() => new Error('No token to refresh'));
        }
        return this.http
            .post(`${this.config.getApiEndpoint(AuthService.apiURL)}/refresh`, { accessToken })
            .pipe(tap((response) => {
            this.setToken(response.accessToken);
            const user = this.authResponseToCurrentUser(response);
            this.currentUserSubject.next(user);
            this.saveUserToStorage(user);
            this.scheduleProactiveRefresh(response.expiresInSeconds);
        }));
    }
    getMe() {
        return this.http
            .get(`${this.config.getApiEndpoint(AuthService.apiURL)}/me`)
            .pipe(tap((response) => {
            const user = {
                userId: response.userId,
                email: response.email,
                name: response.name,
                userName: response.name,
                clientId: response.clientId,
                clientCode: response.clientCode,
                roles: response.roles,
                permissions: response.permissions,
                navigation: response.navigation,
            };
            this.currentUserSubject.next(user);
            this.saveUserToStorage(user);
        }));
    }
    loadSession() {
        if (!this.isAuthenticated()) {
            return of(null);
        }
        return this.getMe();
    }
    getCurrentUser() {
        return this.currentUserSubject.value;
    }
    getToken() {
        return localStorage.getItem('auth_token');
    }
    /** Client code from current user (for X-Client-Code header when calling APIs that require tenant context). */
    getClientCode() {
        return this.currentUserSubject.value?.clientCode ?? this.getStoredClientCode();
    }
    isAuthenticated() {
        return !!this.getToken();
    }
    hasPermission(module, action) {
        const permissions = this.currentUserSubject.value?.permissions;
        if (!permissions?.length) {
            return false;
        }
        if (action == null) {
            return permissions.some((p) => p.module === module);
        }
        return permissions.some((p) => p.module === module && p.action === action);
    }
    /**
     * Returns true if the current user has at least one of the given role codes.
     * Use for UX/labels only; authorization must be based on permissions.
     */
    hasRole(allowedRoles) {
        const userRoles = this.currentUserSubject.value?.roles;
        if (!userRoles?.length || !allowedRoles?.length) {
            return false;
        }
        return allowedRoles.some((code) => userRoles.includes(code));
    }
    /**
     * Returns true if the current user has the permission.
     * @param permission - Either "module:action" or just "module"
     */
    hasPermissionFromString(permission) {
        if (!permission?.trim()) {
            return false;
        }
        const [module, action] = permission.split(':').map((s) => s.trim());
        if (!module) {
            return false;
        }
        return this.hasPermission(module, action || undefined);
    }
    setToken(token) {
        localStorage.setItem('auth_token', token);
    }
    authResponseToCurrentUser(response) {
        return {
            userName: response.userName,
            name: response.userName,
            clientCode: response.clientCode,
            roles: response.roles,
            permissions: response.permissions ?? [],
            navigation: response.navigation,
        };
    }
    getStoredUser() {
        try {
            const user = localStorage.getItem('current_user');
            return user ? JSON.parse(user) : null;
        }
        catch {
            localStorage.removeItem('current_user');
            return null;
        }
    }
    saveUserToStorage(user) {
        localStorage.setItem('current_user', JSON.stringify(user));
        const clientCode = user.clientCode?.trim();
        if (clientCode) {
            localStorage.setItem(STORAGE_KEY_CLIENT_CODE, clientCode);
        }
    }
    getStoredClientCode() {
        const clientCode = localStorage.getItem(STORAGE_KEY_CLIENT_CODE)?.trim();
        return clientCode || null;
    }
    clearStorage() {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('current_user');
        localStorage.removeItem(STORAGE_KEY_EXPIRES_AT);
    }
    /**
     * Schedules a single proactive refresh 1–2 minutes before the token expires (per API doc).
     * Called after login and after each successful refresh.
     */
    scheduleProactiveRefresh(expiresInSeconds) {
        this.clearProactiveRefresh();
        if (expiresInSeconds == null || expiresInSeconds <= 0) {
            return;
        }
        const expiresAtMs = Date.now() + expiresInSeconds * 1000;
        localStorage.setItem(STORAGE_KEY_EXPIRES_AT, String(expiresAtMs));
        const refreshInMs = Math.max(0, (expiresInSeconds - REFRESH_BEFORE_EXPIRY_SECONDS) * 1000);
        this.refreshTimerId = setTimeout(() => {
            this.runProactiveRefresh();
        }, refreshInMs);
    }
    /**
     * On app load, if we have a stored expiration timestamp and a token, reschedule proactive refresh.
     */
    scheduleProactiveRefreshFromStoredExpiry() {
        const token = this.getToken();
        if (!token) {
            return;
        }
        const stored = localStorage.getItem(STORAGE_KEY_EXPIRES_AT);
        if (!stored) {
            return;
        }
        const expiresAtMs = Number(stored);
        if (Number.isNaN(expiresAtMs)) {
            localStorage.removeItem(STORAGE_KEY_EXPIRES_AT);
            return;
        }
        const now = Date.now();
        const msUntilRefresh = expiresAtMs - now - REFRESH_BEFORE_EXPIRY_SECONDS * 1000;
        if (msUntilRefresh <= 0) {
            localStorage.removeItem(STORAGE_KEY_EXPIRES_AT);
            return;
        }
        this.refreshTimerId = setTimeout(() => {
            this.runProactiveRefresh();
        }, msUntilRefresh);
    }
    runProactiveRefresh() {
        this.refreshTimerId = null;
        this.refreshToken().subscribe({
            next: () => { },
            error: () => { }
        });
    }
    clearProactiveRefresh() {
        if (this.refreshTimerId != null) {
            clearTimeout(this.refreshTimerId);
            this.refreshTimerId = null;
        }
        localStorage.removeItem(STORAGE_KEY_EXPIRES_AT);
    }
    static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "20.3.29", ngImport: i0, type: AuthService, deps: [{ token: i1.HttpClient }, { token: i2.Router }, { token: ConfigService }], target: i0.ɵɵFactoryTarget.Injectable });
    static ɵprov = i0.ɵɵngDeclareInjectable({ minVersion: "12.0.0", version: "20.3.29", ngImport: i0, type: AuthService, providedIn: 'root' });
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "20.3.29", ngImport: i0, type: AuthService, decorators: [{
            type: Injectable,
            args: [{
                    providedIn: 'root'
                }]
        }], ctorParameters: () => [{ type: i1.HttpClient }, { type: i2.Router }, { type: ConfigService }] });

class AuthInterceptor {
    authService;
    isRefreshing = false;
    tokenSubject = new Subject();
    constructor(authService) {
        this.authService = authService;
    }
    intercept(request, next) {
        const token = this.authService.getToken();
        if (token && !this.isAuthBypassEndpoint(request)) {
            request = this.addToken(request, token);
        }
        return next.handle(request).pipe(catchError((error) => {
            const status = error instanceof HttpErrorResponse
                ? error.status
                : error?.status;
            if (status === 401) {
                if (this.isLoginEndpoint(request)) {
                    return throwError(() => error);
                }
                return this.handle401Error(request, next, error);
            }
            return throwError(() => error);
        }));
    }
    addToken(request, token) {
        return request.clone({
            setHeaders: {
                Authorization: `Bearer ${token}`
            }
        });
    }
    isRefreshEndpoint(request) {
        return request.url.includes('auth/refresh');
    }
    isLoginEndpoint(request) {
        return request.url.includes('auth/login');
    }
    isAuthBypassEndpoint(request) {
        return this.isLoginEndpoint(request);
    }
    handle401Error(request, next, originalError) {
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
            this.tokenSubject = new Subject();
            this.authService.refreshToken().subscribe({
                next: (response) => {
                    const newToken = response?.accessToken;
                    if (newToken) {
                        this.tokenSubject.next(newToken);
                    }
                    else {
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
        return this.tokenSubject.pipe(take(1), switchMap((newToken) => {
            if (!newToken) {
                return throwError(() => originalError);
            }
            return next.handle(this.addToken(request, newToken));
        }));
    }
    static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "20.3.29", ngImport: i0, type: AuthInterceptor, deps: [{ token: AuthService }], target: i0.ɵɵFactoryTarget.Injectable });
    static ɵprov = i0.ɵɵngDeclareInjectable({ minVersion: "12.0.0", version: "20.3.29", ngImport: i0, type: AuthInterceptor });
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "20.3.29", ngImport: i0, type: AuthInterceptor, decorators: [{
            type: Injectable
        }], ctorParameters: () => [{ type: AuthService }] });

class ErrorNormalizerInterceptor {
    configService;
    constructor(configService) {
        this.configService = configService;
    }
    intercept(request, next) {
        return next.handle(request).pipe(catchError((err) => {
            if (isApiError(err)) {
                return throwError(() => err);
            }
            if (err instanceof HttpErrorResponse && err.status >= 400) {
                const normalized = normalizeHttpError(err);
                if (this.configService.enableLogging &&
                    normalized.traceId) {
                    console.error(`[API Error] ${normalized.code} - ${normalized.detail}`, { traceId: normalized.traceId, status: normalized.status });
                }
                return throwError(() => normalized);
            }
            return throwError(() => err);
        }));
    }
    static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "20.3.29", ngImport: i0, type: ErrorNormalizerInterceptor, deps: [{ token: ConfigService }], target: i0.ɵɵFactoryTarget.Injectable });
    static ɵprov = i0.ɵɵngDeclareInjectable({ minVersion: "12.0.0", version: "20.3.29", ngImport: i0, type: ErrorNormalizerInterceptor });
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "20.3.29", ngImport: i0, type: ErrorNormalizerInterceptor, decorators: [{
            type: Injectable
        }], ctorParameters: () => [{ type: ConfigService }] });

class AuthGuard {
    authService;
    router;
    constructor(authService, router) {
        this.authService = authService;
        this.router = router;
    }
    canActivate(route, state) {
        if (!this.authService.isAuthenticated()) {
            this.router.navigate(['/login'], {
                queryParams: { returnUrl: state.url }
            });
            return false;
        }
        const denyRoles = route.data['denyRoles'];
        if (denyRoles?.length && this.authService.hasRole(denyRoles)) {
            this.router.navigate(['/dashboard']);
            return false;
        }
        const module = route.data['module'];
        const action = route.data['action'] ?? 'view';
        if (module && !this.authService.hasPermission(module, action)) {
            this.router.navigate(['/dashboard']);
            return false;
        }
        return true;
    }
    static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "20.3.29", ngImport: i0, type: AuthGuard, deps: [{ token: AuthService }, { token: i2.Router }], target: i0.ɵɵFactoryTarget.Injectable });
    static ɵprov = i0.ɵɵngDeclareInjectable({ minVersion: "12.0.0", version: "20.3.29", ngImport: i0, type: AuthGuard, providedIn: 'root' });
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "20.3.29", ngImport: i0, type: AuthGuard, decorators: [{
            type: Injectable,
            args: [{
                    providedIn: 'root'
                }]
        }], ctorParameters: () => [{ type: AuthService }, { type: i2.Router }] });

class NoAuthGuard {
    authService;
    router;
    constructor(authService, router) {
        this.authService = authService;
        this.router = router;
    }
    canActivate(route, state) {
        // Permite navegación explícita al login incluso si el estado de auth es inconsistente.
        const forceLogin = route.queryParamMap.get('forceLogin') === '1';
        if (forceLogin) {
            return true;
        }
        if (this.authService.isAuthenticated()) {
            this.router.navigate(['/dashboard']);
            return false;
        }
        return true;
    }
    static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "20.3.29", ngImport: i0, type: NoAuthGuard, deps: [{ token: AuthService }, { token: i2.Router }], target: i0.ɵɵFactoryTarget.Injectable });
    static ɵprov = i0.ɵɵngDeclareInjectable({ minVersion: "12.0.0", version: "20.3.29", ngImport: i0, type: NoAuthGuard, providedIn: 'root' });
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "20.3.29", ngImport: i0, type: NoAuthGuard, decorators: [{
            type: Injectable,
            args: [{
                    providedIn: 'root'
                }]
        }], ctorParameters: () => [{ type: AuthService }, { type: i2.Router }] });

const ICON_PATHS = {
    error: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    success: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    warning: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
    info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
};
const TYPE_LABELS = {
    success: 'Éxito',
    error: 'Error',
    warning: 'Advertencia',
    info: 'Información',
};
const TYPE_CLASSES = {
    success: { border: 'border-l-ok', iconBg: 'bg-ok-light', iconText: 'text-ok-dark', progress: 'bg-ok' },
    error: { border: 'border-l-hi', iconBg: 'bg-hi-light', iconText: 'text-hi-dark', progress: 'bg-hi' },
    warning: { border: 'border-l-lo', iconBg: 'bg-lo-light', iconText: 'text-lo-dark', progress: 'bg-lo' },
    info: { border: 'border-l-info', iconBg: 'bg-info-light', iconText: 'text-info-dark', progress: 'bg-info' },
};
class Notification {
    notification;
    dismiss = new EventEmitter();
    isVisible = false;
    timeoutId;
    ngOnInit() {
        setTimeout(() => {
            this.isVisible = true;
        }, 10);
        if (this.notification.duration != null && this.notification.duration > 0) {
            this.timeoutId = setTimeout(() => {
                this.handleDismiss();
            }, this.notification.duration);
        }
    }
    ngOnDestroy() {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
        }
    }
    handleDismiss() {
        this.isVisible = false;
        setTimeout(() => {
            this.dismiss.emit(this.notification.id);
        }, 300);
    }
    get iconPath() {
        return ICON_PATHS[this.notification.type];
    }
    get typeLabel() {
        return TYPE_LABELS[this.notification.type];
    }
    get typeClasses() {
        return TYPE_CLASSES[this.notification.type];
    }
    get hasAutoDismiss() {
        return !!this.notification.duration && this.notification.duration > 0;
    }
    get durationMs() {
        return this.notification.duration ?? 0;
    }
    static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "20.3.29", ngImport: i0, type: Notification, deps: [], target: i0.ɵɵFactoryTarget.Component });
    static ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "20.3.29", type: Notification, isStandalone: true, selector: "nori-notification", inputs: { notification: "notification" }, outputs: { dismiss: "dismiss" }, ngImport: i0, template: "<div\n  class=\"pointer-events-auto relative flex w-80 max-w-[calc(100vw-2rem)] items-start gap-3 overflow-hidden rounded-xl border-l-4 bg-white p-4 shadow-e4 transition-all duration-300 ease-eout\"\n  [ngClass]=\"typeClasses.border\"\n  [class.opacity-0]=\"!isVisible\"\n  [class.translate-x-4]=\"!isVisible\"\n  aria-live=\"polite\"\n>\n  <div class=\"flex h-9 w-9 shrink-0 items-center justify-center rounded-full\" [ngClass]=\"typeClasses.iconBg\">\n    <svg class=\"h-5 w-5\" [ngClass]=\"typeClasses.iconText\" fill=\"none\" stroke=\"currentColor\" viewBox=\"0 0 24 24\">\n      <path stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\" [attr.d]=\"iconPath\" />\n    </svg>\n  </div>\n\n  <div class=\"min-w-0 flex-1 pt-0.5\">\n    <p class=\"text-caption font-bold uppercase tracking-wide text-type-3\">{{ typeLabel }}</p>\n    <p *ngIf=\"notification.title\" class=\"mt-0.5 text-sm font-semibold text-type-1\">{{ notification.title }}</p>\n    <p class=\"mt-0.5 break-words text-sm text-type-2\">{{ notification.message }}</p>\n  </div>\n\n  <button\n    *ngIf=\"notification.dismissible\"\n    type=\"button\"\n    class=\"shrink-0 rounded-md p-1 text-type-3 transition-colors hover:bg-surface-sunken hover:text-type-1\"\n    (click)=\"handleDismiss()\"\n    aria-label=\"Cerrar notificaci\u00F3n\"\n  >\n    <svg class=\"h-4 w-4\" fill=\"none\" stroke=\"currentColor\" viewBox=\"0 0 24 24\">\n      <path stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\" d=\"M6 18L18 6M6 6l12 12\" />\n    </svg>\n  </button>\n\n  <div\n    *ngIf=\"hasAutoDismiss\"\n    class=\"absolute bottom-0 left-0 h-0.5 w-full origin-left animate-[shrink_linear_forwards]\"\n    [ngClass]=\"typeClasses.progress\"\n    [style.animationDuration]=\"durationMs + 'ms'\"\n  ></div>\n</div>\n", dependencies: [{ kind: "ngmodule", type: CommonModule }, { kind: "directive", type: i1$1.NgClass, selector: "[ngClass]", inputs: ["class", "ngClass"] }, { kind: "directive", type: i1$1.NgIf, selector: "[ngIf]", inputs: ["ngIf", "ngIfThen", "ngIfElse"] }] });
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "20.3.29", ngImport: i0, type: Notification, decorators: [{
            type: Component,
            args: [{ selector: 'nori-notification', standalone: true, imports: [CommonModule], template: "<div\n  class=\"pointer-events-auto relative flex w-80 max-w-[calc(100vw-2rem)] items-start gap-3 overflow-hidden rounded-xl border-l-4 bg-white p-4 shadow-e4 transition-all duration-300 ease-eout\"\n  [ngClass]=\"typeClasses.border\"\n  [class.opacity-0]=\"!isVisible\"\n  [class.translate-x-4]=\"!isVisible\"\n  aria-live=\"polite\"\n>\n  <div class=\"flex h-9 w-9 shrink-0 items-center justify-center rounded-full\" [ngClass]=\"typeClasses.iconBg\">\n    <svg class=\"h-5 w-5\" [ngClass]=\"typeClasses.iconText\" fill=\"none\" stroke=\"currentColor\" viewBox=\"0 0 24 24\">\n      <path stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\" [attr.d]=\"iconPath\" />\n    </svg>\n  </div>\n\n  <div class=\"min-w-0 flex-1 pt-0.5\">\n    <p class=\"text-caption font-bold uppercase tracking-wide text-type-3\">{{ typeLabel }}</p>\n    <p *ngIf=\"notification.title\" class=\"mt-0.5 text-sm font-semibold text-type-1\">{{ notification.title }}</p>\n    <p class=\"mt-0.5 break-words text-sm text-type-2\">{{ notification.message }}</p>\n  </div>\n\n  <button\n    *ngIf=\"notification.dismissible\"\n    type=\"button\"\n    class=\"shrink-0 rounded-md p-1 text-type-3 transition-colors hover:bg-surface-sunken hover:text-type-1\"\n    (click)=\"handleDismiss()\"\n    aria-label=\"Cerrar notificaci\u00F3n\"\n  >\n    <svg class=\"h-4 w-4\" fill=\"none\" stroke=\"currentColor\" viewBox=\"0 0 24 24\">\n      <path stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\" d=\"M6 18L18 6M6 6l12 12\" />\n    </svg>\n  </button>\n\n  <div\n    *ngIf=\"hasAutoDismiss\"\n    class=\"absolute bottom-0 left-0 h-0.5 w-full origin-left animate-[shrink_linear_forwards]\"\n    [ngClass]=\"typeClasses.progress\"\n    [style.animationDuration]=\"durationMs + 'ms'\"\n  ></div>\n</div>\n" }]
        }], propDecorators: { notification: [{
                type: Input,
                args: [{ required: true }]
            }], dismiss: [{
                type: Output
            }] } });

class NotificationsContainer {
    notificationService;
    notifications = [];
    position = 'top-right';
    maxVisible = 5;
    subscription;
    positionSubscription;
    constructor(notificationService) {
        this.notificationService = notificationService;
    }
    ngOnInit() {
        this.subscription = this.notificationService.notifications$.subscribe((notifications) => {
            this.notifications = notifications.slice(-this.maxVisible);
        });
        this.positionSubscription = this.notificationService.position$.subscribe((position) => {
            this.position = position;
        });
    }
    ngOnDestroy() {
        this.subscription?.unsubscribe();
        this.positionSubscription?.unsubscribe();
    }
    onDismiss(id) {
        this.notificationService.remove(id);
    }
    static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "20.3.29", ngImport: i0, type: NotificationsContainer, deps: [{ token: NotificationService }], target: i0.ɵɵFactoryTarget.Component });
    static ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "20.3.29", type: NotificationsContainer, isStandalone: true, selector: "nori-notifications-container", ngImport: i0, template: "<div\n  class=\"pointer-events-none fixed z-[9999] flex flex-col gap-3\"\n  [class.top-4]=\"position === 'top-right'\"\n  [class.right-4]=\"true\"\n  [class.bottom-4]=\"position === 'bottom-right'\"\n>\n  <nori-notification\n    *ngFor=\"let notification of notifications\"\n    [notification]=\"notification\"\n    (dismiss)=\"onDismiss($event)\"\n  ></nori-notification>\n</div>\n", dependencies: [{ kind: "ngmodule", type: CommonModule }, { kind: "directive", type: i1$1.NgForOf, selector: "[ngFor][ngForOf]", inputs: ["ngForOf", "ngForTrackBy", "ngForTemplate"] }, { kind: "component", type: Notification, selector: "nori-notification", inputs: ["notification"], outputs: ["dismiss"] }] });
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "20.3.29", ngImport: i0, type: NotificationsContainer, decorators: [{
            type: Component,
            args: [{ selector: 'nori-notifications-container', standalone: true, imports: [CommonModule, Notification], template: "<div\n  class=\"pointer-events-none fixed z-[9999] flex flex-col gap-3\"\n  [class.top-4]=\"position === 'top-right'\"\n  [class.right-4]=\"true\"\n  [class.bottom-4]=\"position === 'bottom-right'\"\n>\n  <nori-notification\n    *ngFor=\"let notification of notifications\"\n    [notification]=\"notification\"\n    (dismiss)=\"onDismiss($event)\"\n  ></nori-notification>\n</div>\n" }]
        }], ctorParameters: () => [{ type: NotificationService }] });

/*
 * Public API Surface of core
 */

/**
 * Generated bundle index. Do not edit.
 */

export { AuthGuard, AuthInterceptor, AuthService, ConfigService, ErrorMappingService, ErrorNormalizerInterceptor, HttpService, NoAuthGuard, Notification, NotificationService, NotificationsContainer, applyValidationErrors, environment, isApiError, normalizeHttpError };
//# sourceMappingURL=core.mjs.map
