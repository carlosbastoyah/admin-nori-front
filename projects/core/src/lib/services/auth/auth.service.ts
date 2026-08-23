import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, of, throwError } from 'rxjs';
import { tap, catchError, map, switchMap } from 'rxjs/operators';
import { ConfigService } from '../config.service';
import { Router } from '@angular/router';

export interface LoginRequest {
    login: string;
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
    expiresInSeconds?: number;
    tokenType?: string;
    userName?: string;
    clientCode?: string;
    roles?: string[];
    permissions?: Permission[];
    navigation?: Navigation;
}

export interface MeResponse {
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
export interface CurrentUser {
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

/** Refresh token this many seconds before it expires (per API doc recommendation). */
const REFRESH_BEFORE_EXPIRY_SECONDS = 120;

const STORAGE_KEY_EXPIRES_AT = 'auth_token_expires_at';
const STORAGE_KEY_CLIENT_CODE = 'client_code';

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private static readonly apiURL = 'administration/auth';

    private readonly currentUserSubject: BehaviorSubject<CurrentUser | null>;
    public readonly currentUser$: Observable<CurrentUser | null>;

    private readonly isAuthenticatedSubject: BehaviorSubject<boolean>;
    public readonly isAuthenticated$: Observable<boolean>;

    private refreshTimerId: ReturnType<typeof setTimeout> | null = null;

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

        this.scheduleProactiveRefreshFromStoredExpiry();
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
                    this.scheduleProactiveRefresh(response.expiresInSeconds);
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
        const clearAndRedirect = (): void => {
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
            .pipe(
                map(() => void 0),
                tap(() => clearAndRedirect()),
                catchError(() => {
                    clearAndRedirect();
                    return of(void 0);
                })
            );
    }

    refreshToken(): Observable<AuthResponse> {
        const accessToken = this.getToken();
        if (!accessToken) {
            return throwError(() => new Error('No token to refresh'));
        }
        return this.http
            .post<AuthResponse>(`${this.config.getApiEndpoint(AuthService.apiURL)}/refresh`, { accessToken })
            .pipe(
                tap((response) => {
                    this.setToken(response.accessToken);
                    const user = this.authResponseToCurrentUser(response);
                    this.currentUserSubject.next(user);
                    this.saveUserToStorage(user);
                    this.scheduleProactiveRefresh(response.expiresInSeconds);
                })
            );
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
                        userName: response.name,
                        clientId: response.clientId,
                        clientCode: response.clientCode,
                        roles: response.roles,
                        permissions: response.permissions,
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
            userName: response.userName,
            name: response.userName,
            clientCode: response.clientCode,
            roles: response.roles,
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
        localStorage.removeItem(STORAGE_KEY_EXPIRES_AT);
    }

    /**
     * Schedules a single proactive refresh 1–2 minutes before the token expires (per API doc).
     * Called after login and after each successful refresh.
     */
    private scheduleProactiveRefresh(expiresInSeconds?: number): void {
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
    private scheduleProactiveRefreshFromStoredExpiry(): void {
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

    private runProactiveRefresh(): void {
        this.refreshTimerId = null;
        this.refreshToken().subscribe({
            next: () => {},
            error: () => {}
        });
    }

    private clearProactiveRefresh(): void {
        if (this.refreshTimerId != null) {
            clearTimeout(this.refreshTimerId);
            this.refreshTimerId = null;
        }
        localStorage.removeItem(STORAGE_KEY_EXPIRES_AT);
    }
}
