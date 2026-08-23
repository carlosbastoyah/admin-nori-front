import { HttpErrorResponse, HttpClient, HttpParams, HttpInterceptor, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
import { FormGroup } from '@angular/forms';
import * as i0 from '@angular/core';
import { OnInit, OnDestroy, EventEmitter } from '@angular/core';
import { Observable } from 'rxjs';
import { Router, CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';

interface Environment {
    production: boolean;
    API_URL: string;
    apiTimeout: number;
    enableLogging: boolean;
}

declare const environment: Environment;

/**
 * Raw RFC 7807 Problem Details from the API.
 * Backend may send traceId, code, errors in body or under extensions (camelCase when serialized).
 */
interface ProblemDetails {
    type?: string;
    title?: string;
    status?: number;
    detail?: string;
    instance?: string;
    traceId?: string;
    code?: string;
    errors?: ProblemDetailsValidationError[];
    extensions?: {
        traceId?: string;
        code?: string;
        errors?: ProblemDetailsValidationError[];
    };
}
interface ProblemDetailsValidationError {
    propertyName: string;
    errorMessage: string;
}
/**
 * Normalized error shape used across the app after ErrorNormalizerInterceptor or normalizeHttpError.
 */
interface ApiError {
    status: number;
    code: string;
    detail: string;
    traceId?: string;
    errors?: Record<string, string>;
    original?: HttpErrorResponse;
}
declare function normalizeHttpError(response: HttpErrorResponse): ApiError;
/**
 * Type guard: value has ApiError shape (normalized error).
 */
declare function isApiError(value: unknown): value is ApiError;
/**
 * Applies server validation errors to form controls.
 * Use when API returns 400 with errors array (propertyName → errorMessage).
 * nameMap maps backend property names (e.g. PascalCase) to form control names (e.g. camelCase).
 */
declare function applyValidationErrors(form: FormGroup, errors: Record<string, string>, nameMap?: Record<string, string>): void;

type NotificationType = 'error' | 'success' | 'warning' | 'info';
type NotificationPosition = 'top-right' | 'bottom-right';
interface INotification {
    id: string;
    type: NotificationType;
    title?: string;
    message: string;
    duration?: number;
    dismissible?: boolean;
}

declare class ConfigService {
    private readonly config;
    get production(): boolean;
    get apiUrl(): string;
    get apiTimeout(): number;
    get enableLogging(): boolean;
    getApiEndpoint(path: string): string;
    static ɵfac: i0.ɵɵFactoryDeclaration<ConfigService, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<ConfigService>;
}

interface ApiResponse<T> {
    success: boolean;
    data?: T;
    message?: string;
    errors?: any;
}
declare class HttpService {
    private readonly http;
    private readonly config;
    constructor(http: HttpClient, config: ConfigService);
    private get apiUrl();
    get<T>(endpoint: string, params?: HttpParams): Observable<T>;
    post<T>(endpoint: string, body: any): Observable<T>;
    put<T>(endpoint: string, body: any): Observable<T>;
    patch<T>(endpoint: string, body: any): Observable<T>;
    delete<T>(endpoint: string): Observable<T>;
    private handleError;
    static ɵfac: i0.ɵɵFactoryDeclaration<HttpService, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<HttpService>;
}

declare class ErrorMappingService {
    /**
     * Returns a user-facing message for the given ApiError.
     * Prefers API detail when present; otherwise code map, then status-based fallback.
     * For INTERNAL_ERROR when using fallback, appends traceId when available for support.
     */
    getMessage(apiError: ApiError): string;
    static ɵfac: i0.ɵɵFactoryDeclaration<ErrorMappingService, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<ErrorMappingService>;
}

declare class NotificationService {
    private readonly notificationsSubject;
    readonly notifications$: Observable<INotification[]>;
    private readonly positionSubject;
    readonly position$: Observable<NotificationPosition>;
    private generateId;
    show(type: NotificationType, message: string, title?: string, duration?: number | null): void;
    error(message: string, title?: string, duration?: number | null): void;
    /**
     * Muestra un error extrayendo `detail` de ApiError automáticamente.
     * Úsalo en handlers HTTP: `this.notificationService.apiError(err, 'Mensaje alternativo')`.
     */
    apiError(err: unknown, fallback?: string, title?: string): void;
    success(message: string, title?: string, duration?: number | null): void;
    warning(message: string, title?: string, duration?: number | null): void;
    info(message: string, title?: string, duration?: number | null): void;
    remove(id: string): void;
    clear(): void;
    setPosition(position: NotificationPosition): void;
    getPosition(): NotificationPosition;
    static ɵfac: i0.ɵɵFactoryDeclaration<NotificationService, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<NotificationService>;
}

interface LoginRequest {
    login: string;
    password: string;
}
interface Permission {
    module: string;
    action: string;
}
interface NavItem {
    id: string;
    path: string;
    label: string;
    iconKey?: string | null;
    requiredPermissions: string[];
}
interface NavGroup {
    id: string;
    label: string;
    iconKey?: string | null;
    order?: number;
    collapsible?: boolean;
    items: NavItem[];
}
interface Navigation {
    shell: string;
    items: NavItem[];
    groups?: NavGroup[];
}
interface AuthResponse {
    accessToken: string;
    expiresInSeconds?: number;
    tokenType?: string;
    userName?: string;
    clientCode?: string;
    roles?: string[];
    permissions?: Permission[];
    navigation?: Navigation;
}
interface MeResponse {
    userId: string;
    email: string;
    name: string;
    clientId: string;
    clientCode: string;
    roles: string[];
    permissions: Permission[];
    navigation?: Navigation;
}
/** User/session data used in UI (from login/refresh or from /me). */
interface CurrentUser {
    userName?: string;
    name?: string;
    email?: string;
    userId?: string;
    clientId?: string;
    clientCode?: string;
    roles?: string[];
    permissions?: Permission[];
    navigation?: Navigation;
}
declare class AuthService {
    private readonly http;
    private readonly router;
    private readonly config;
    private static readonly apiURL;
    private readonly currentUserSubject;
    readonly currentUser$: Observable<CurrentUser | null>;
    private readonly isAuthenticatedSubject;
    readonly isAuthenticated$: Observable<boolean>;
    private refreshTimerId;
    constructor(http: HttpClient, router: Router, config: ConfigService);
    login(credentials: LoginRequest): Observable<AuthResponse>;
    logout(): Observable<void>;
    refreshToken(): Observable<AuthResponse>;
    getMe(): Observable<MeResponse>;
    loadSession(): Observable<MeResponse | null>;
    getCurrentUser(): CurrentUser | null;
    getToken(): string | null;
    /** Client code from current user (for X-Client-Code header when calling APIs that require tenant context). */
    getClientCode(): string | null;
    isAuthenticated(): boolean;
    hasPermission(module: string, action?: string): boolean;
    /**
     * Returns true if the current user has at least one of the given role codes.
     * Use for UX/labels only; authorization must be based on permissions.
     */
    hasRole(allowedRoles: string[]): boolean;
    /**
     * Returns true if the current user has the permission.
     * @param permission - Either "module:action" or just "module"
     */
    hasPermissionFromString(permission: string): boolean;
    private setToken;
    private authResponseToCurrentUser;
    private getStoredUser;
    private saveUserToStorage;
    private getStoredClientCode;
    private clearStorage;
    /**
     * Schedules a single proactive refresh 1–2 minutes before the token expires (per API doc).
     * Called after login and after each successful refresh.
     */
    private scheduleProactiveRefresh;
    /**
     * On app load, if we have a stored expiration timestamp and a token, reschedule proactive refresh.
     */
    private scheduleProactiveRefreshFromStoredExpiry;
    private runProactiveRefresh;
    private clearProactiveRefresh;
    static ɵfac: i0.ɵɵFactoryDeclaration<AuthService, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<AuthService>;
}

declare class AuthInterceptor implements HttpInterceptor {
    private readonly authService;
    private isRefreshing;
    private tokenSubject;
    constructor(authService: AuthService);
    intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>>;
    private addToken;
    private isRefreshEndpoint;
    private isLoginEndpoint;
    private isAuthBypassEndpoint;
    private handle401Error;
    static ɵfac: i0.ɵɵFactoryDeclaration<AuthInterceptor, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<AuthInterceptor>;
}

declare class ErrorNormalizerInterceptor implements HttpInterceptor {
    private readonly configService;
    constructor(configService: ConfigService);
    intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>>;
    static ɵfac: i0.ɵɵFactoryDeclaration<ErrorNormalizerInterceptor, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<ErrorNormalizerInterceptor>;
}

declare class AuthGuard implements CanActivate {
    private readonly authService;
    private readonly router;
    constructor(authService: AuthService, router: Router);
    canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean | UrlTree> | Promise<boolean | UrlTree> | boolean | UrlTree;
    static ɵfac: i0.ɵɵFactoryDeclaration<AuthGuard, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<AuthGuard>;
}

declare class NoAuthGuard implements CanActivate {
    private readonly authService;
    private readonly router;
    constructor(authService: AuthService, router: Router);
    canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean | UrlTree> | Promise<boolean | UrlTree> | boolean | UrlTree;
    static ɵfac: i0.ɵɵFactoryDeclaration<NoAuthGuard, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<NoAuthGuard>;
}

declare class Notification implements OnInit, OnDestroy {
    notification: INotification;
    dismiss: EventEmitter<string>;
    isVisible: boolean;
    private timeoutId?;
    ngOnInit(): void;
    ngOnDestroy(): void;
    handleDismiss(): void;
    get iconPath(): string;
    get typeLabel(): string;
    get typeClasses(): {
        border: string;
        iconBg: string;
        iconText: string;
        progress: string;
    };
    get hasAutoDismiss(): boolean;
    get durationMs(): number;
    static ɵfac: i0.ɵɵFactoryDeclaration<Notification, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<Notification, "nori-notification", never, { "notification": { "alias": "notification"; "required": true; }; }, { "dismiss": "dismiss"; }, never, never, true, never>;
}

declare class NotificationsContainer implements OnInit, OnDestroy {
    private readonly notificationService;
    notifications: INotification[];
    position: NotificationPosition;
    private readonly maxVisible;
    private subscription?;
    private positionSubscription?;
    constructor(notificationService: NotificationService);
    ngOnInit(): void;
    ngOnDestroy(): void;
    onDismiss(id: string): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<NotificationsContainer, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<NotificationsContainer, "nori-notifications-container", never, {}, {}, never, never, true, never>;
}

export { AuthGuard, AuthInterceptor, AuthService, ConfigService, ErrorMappingService, ErrorNormalizerInterceptor, HttpService, NoAuthGuard, Notification, NotificationService, NotificationsContainer, applyValidationErrors, environment, isApiError, normalizeHttpError };
export type { ApiError, ApiResponse, AuthResponse, CurrentUser, Environment, INotification, LoginRequest, MeResponse, NavGroup, NavItem, Navigation, NotificationPosition, NotificationType, Permission, ProblemDetails, ProblemDetailsValidationError };
