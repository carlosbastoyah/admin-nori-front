import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, of, throwError } from 'rxjs';
import { tap, catchError, map, switchMap, finalize, shareReplay } from 'rxjs/operators';
import { ConfigService } from '../config.service';
import { Router } from '@angular/router';

export interface LoginRequest {
    email: string;
    password: string;
}

export interface Permission {
    module: string;
    action: string;
}

export interface NavItem {
    id: string;
    path: string;
    label: string;
    iconKey?: string | null;
    requiredPermissions: string[];
}

export interface NavGroup {
    id: string;
    label: string;
    iconKey?: string | null;
    order?: number;
    collapsible?: boolean;
    items: NavItem[];
}

export interface Navigation {
    shell: string;
    items: NavItem[];
    groups?: NavGroup[];
}

export interface AuthResponse {
    accessToken: string;
    /** The admin API sends one platform role (platform_admin, platform_sales…) instead of `roles`. */
    role?: string;
    email?: string;
    userId?: string;
    expiresInSeconds?: number;
    tokenType?: string;
    clientCode?: string;
    roles?: string[];
    permissions?: Permission[];
    navigation?: Navigation;
    name?: string;
}

export interface MeResponse {
    userId: string;
    email: string;
    name: string;
    clientId?: string;
    clientCode?: string;
    roles?: string[];
    /** Platform staff: one role instead of `roles`. */
    role?: string;
    permissions?: Permission[];
    navigation?: Navigation;
}

/** User/session data used in UI (from login/refresh or from /me). */
export interface CurrentUser {
    name?: string;
    email?: string;
    userId?: string;
    clientId?: string;
    clientCode?: string;
    roles?: string[];
    permissions?: Permission[];
    navigation?: Navigation;
}

/** Refresh token this many seconds before it expires (per API doc recommendation). */
const REFRESH_BEFORE_EXPIRY_SECONDS = 120;
/** Wait before trying again when a proactive refresh fails for a reason other than a rejected session (offline, 5xx). */
const RETRY_REFRESH_MS = 30_000;

const STORAGE_KEY_EXPIRES_AT = 'auth_token_expires_at';
const STORAGE_KEY_CLIENT_CODE = 'client_code';

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private static readonly apiURL = 'administration/admin/auth';

    private readonly currentUserSubject: BehaviorSubject<CurrentUser | null>;
    public readonly currentUser$: Observable<CurrentUser | null>;

    private readonly isAuthenticatedSubject: BehaviorSubject<boolean>;
    public readonly isAuthenticated$: Observable<boolean>;

    private refreshTimerId: ReturnType<typeof setTimeout> | null = null;
    /** The refresh in progress, shared by every caller so a burst of 401s makes one request. */
    private refreshInFlight$: Observable<AuthResponse> | null = null;

    constructor(
        private readonly http: HttpClient,
        private readonly router: Router,
        private readonly config: ConfigService
    ) {
        const storedUser = this.getStoredUser();
        this.currentUserSubject = new BehaviorSubject<CurrentUser | null>(storedUser);
        this.currentUser$ = this.currentUserSubject.asObservable();

        this.isAuthenticatedSubject = new BehaviorSubject<boolean>(!!localStorage.getItem('auth_token'));
        this.isAuthenticated$ = this.isAuthenticatedSubject.asObservable();

        this.scheduleProactiveRefresh();
        this.listenForSessionChanges();
    }

    login(credentials: LoginRequest): Observable<AuthResponse> {
        return this.http
            .post<AuthResponse>(`${this.config.getApiEndpoint(AuthService.apiURL)}/login`, credentials)
            .pipe(
                tap((response) => {
                    this.setToken(response.accessToken);
                    const user = this.authResponseToCurrentUser(response);
                    this.currentUserSubject.next(user);
                    this.saveUserToStorage(user);
                    this.isAuthenticatedSubject.next(true);
                    this.scheduleProactiveRefresh();
                }),
                switchMap((response) =>
                    this.getMe().pipe(
                        map(() => response),
                        catchError(() => of(response))
                    )
                )
            );
    }

    logout(): Observable<void> {
        const accessToken = this.getToken();
        // The session ends here whatever the API answers; revoking the token is best effort.
        this.endSession();
        if (!accessToken) {
            return of(void 0);
        }

        return this.http
            .post(`${this.config.getApiEndpoint(AuthService.apiURL)}/logout`, { accessToken }, { responseType: 'text' })
            .pipe(
                map(() => void 0),
                catchError(() => of(void 0))
            );
    }

    /**
     * Exchanges the current token (it may already be expired) for a new one. Concurrent callers share the same
     * request. When the API rejects the session (401/400/403) the user is logged out; a network or server error keeps
     * the session so a later attempt can still succeed.
     */
    refreshToken(): Observable<AuthResponse> {
        if (this.refreshInFlight$) {
            return this.refreshInFlight$;
        }
        const accessToken = this.getToken();
        if (!accessToken) {
            return throwError(() => new Error('No token to refresh'));
        }
        this.refreshInFlight$ = this.http
            .post<AuthResponse>(`${this.config.getApiEndpoint(AuthService.apiURL)}/refresh`, { accessToken })
            .pipe(
                tap((response) => {
                    this.setToken(response.accessToken);
                    const user = { ...this.currentUserSubject.value, ...this.authResponseToCurrentUser(response) };
                    this.currentUserSubject.next(user);
                    this.saveUserToStorage(user);
                    this.isAuthenticatedSubject.next(true);
                    this.scheduleProactiveRefresh();
                }),
                catchError((error) => {
                    if (this.isSessionRejected(error)) {
                        this.logout().subscribe();
                    }
                    return throwError(() => error);
                }),
                finalize(() => {
                    this.refreshInFlight$ = null;
                }),
                shareReplay({ bufferSize: 1, refCount: false })
            );
        return this.refreshInFlight$;
    }

    getMe(): Observable<MeResponse> {
        return this.http
            .get<MeResponse>(`${this.config.getApiEndpoint(AuthService.apiURL)}/me`)
            .pipe(
                tap((response) => {
                    const user: CurrentUser = {
                        userId: response.userId,
                        email: response.email,
                        name: response.name,
                        clientId: response.clientId,
                        clientCode: response.clientCode,
                        roles: response.roles ?? (response.role ? [response.role] : []),
                        permissions: response.permissions ?? [],
                        navigation: response.navigation,
                    };
                    this.currentUserSubject.next(user);
                    this.saveUserToStorage(user);
                })
            );
    }

    loadSession(): Observable<MeResponse | null> {
        if (!this.isAuthenticated()) {
            return of(null);
        }
        return this.getMe();
    }

    getCurrentUser(): CurrentUser | null {
        return this.currentUserSubject.value;
    }

    getToken(): string | null {
        return localStorage.getItem('auth_token');
    }

    /** Client code from current user (for X-Client-Code header when calling APIs that require tenant context). */
    getClientCode(): string | null {
        return this.currentUserSubject.value?.clientCode ?? this.getStoredClientCode();
    }

    isAuthenticated(): boolean {
        return !!this.getToken();
    }

    hasPermission(module: string, action?: string): boolean {
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
    hasRole(allowedRoles: string[]): boolean {
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
    hasPermissionFromString(permission: string): boolean {
        if (!permission?.trim()) {
            return false;
        }
        const [module, action] = permission.split(':').map((s) => s.trim());
        if (!module) {
            return false;
        }
        return this.hasPermission(module, action || undefined);
    }

    private setToken(token: string): void {
        localStorage.setItem('auth_token', token);
    }

    private authResponseToCurrentUser(response: AuthResponse): CurrentUser {
        return {
            name: response.name,
            email: response.email,
            userId: response.userId,
            clientCode: response.clientCode,
            roles: response.roles ?? (response.role ? [response.role] : []),
            permissions: response.permissions ?? [],
            navigation: response.navigation,
        };
    }

    private getStoredUser(): CurrentUser | null {
        try {
            const user = localStorage.getItem('current_user');
            return user ? JSON.parse(user) : null;
        } catch {
            localStorage.removeItem('current_user');
            return null;
        }
    }

    private saveUserToStorage(user: CurrentUser): void {
        localStorage.setItem('current_user', JSON.stringify(user));
        const clientCode = user.clientCode?.trim();
        if (clientCode) {
            localStorage.setItem(STORAGE_KEY_CLIENT_CODE, clientCode);
        }
    }

    private getStoredClientCode(): string | null {
        const clientCode = localStorage.getItem(STORAGE_KEY_CLIENT_CODE)?.trim();
        return clientCode || null;
    }

    private clearStorage(): void {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('current_user');
        // Written by earlier versions; the expiry now comes from the token itself.
        localStorage.removeItem(STORAGE_KEY_EXPIRES_AT);
    }

    /** Clears everything about the session on this tab and goes to the login. */
    private endSession(): void {
        this.clearProactiveRefresh();
        this.clearStorage();
        this.currentUserSubject.next(null);
        this.isAuthenticatedSubject.next(false);
        if (!this.router.url.startsWith('/login')) {
            this.router.navigate(['/login']);
        }
    }

    /** The API refused the token itself; trying again will not help. */
    private isSessionRejected(error: unknown): boolean {
        const status = (error as { status?: number })?.status;
        return status === 400 || status === 401 || status === 403;
    }

    /** When the token expires, read from its own `exp` claim so it survives reloads and other tabs. */
    private tokenExpiresAt(token: string | null): number | null {
        try {
            const payload = token?.split('.')[1];
            if (!payload) {
                return null;
            }
            const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
            const exp = JSON.parse(json)?.exp;
            return typeof exp === 'number' ? exp * 1000 : null;
        } catch {
            return null;
        }
    }

    /**
     * Schedules one refresh a couple of minutes before the current token expires, or runs it now when that moment
     * already passed (a reload, a laptop waking up). Called after login, after each refresh and on app start.
     */
    private scheduleProactiveRefresh(): void {
        this.clearProactiveRefresh();
        const expiresAt = this.tokenExpiresAt(this.getToken());
        if (expiresAt == null) {
            return;
        }
        const refreshInMs = Math.max(0, expiresAt - Date.now() - REFRESH_BEFORE_EXPIRY_SECONDS * 1000);
        this.refreshTimerId = setTimeout(() => this.runProactiveRefresh(), refreshInMs);
    }

    private runProactiveRefresh(): void {
        this.refreshTimerId = null;
        if (!this.getToken()) {
            return;
        }
        this.refreshToken().subscribe({
            error: (error) => {
                // A rejected session already logged out; anything else (offline, server down) tries again later.
                if (!this.isSessionRejected(error)) {
                    this.refreshTimerId = setTimeout(() => this.runProactiveRefresh(), RETRY_REFRESH_MS);
                }
            }
        });
    }

    /** Refreshes now if the token is about to expire; timers do not run while the computer sleeps. */
    private refreshIfDue(): void {
        const expiresAt = this.tokenExpiresAt(this.getToken());
        if (expiresAt != null && expiresAt - Date.now() <= REFRESH_BEFORE_EXPIRY_SECONDS * 1000) {
            this.runProactiveRefresh();
        }
    }

    /**
     * Keeps tabs in step: a token refreshed or a logout in another tab applies here too, instead of this tab
     * refreshing with a token the other one replaced. Also catches up when the tab comes back after sleeping.
     */
    private listenForSessionChanges(): void {
        if (typeof window === 'undefined') {
            return;
        }
        window.addEventListener('storage', (event) => {
            if (event.key !== 'auth_token') {
                return;
            }
            if (event.newValue) {
                this.isAuthenticatedSubject.next(true);
                const user = this.getStoredUser();
                if (user) {
                    this.currentUserSubject.next(user);
                }
                this.scheduleProactiveRefresh();
            } else {
                this.endSession();
            }
        });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.refreshIfDue();
            }
        });
        window.addEventListener('online', () => this.refreshIfDue());
    }

    private clearProactiveRefresh(): void {
        if (this.refreshTimerId != null) {
            clearTimeout(this.refreshTimerId);
            this.refreshTimerId = null;
        }
    }
}
