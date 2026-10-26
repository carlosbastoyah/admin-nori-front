import { TestBed } from '@angular/core/testing';
import { HTTP_INTERCEPTORS, HttpClient, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AuthInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';
import { ConfigService } from '../config.service';

/** A JWT whose only meaningful part is `exp`, seconds from now. */
function token(name: string, expiresInSeconds: number): string {
  const payload = btoa(JSON.stringify({ sub: name, exp: Math.floor(Date.now() / 1000) + expiresInSeconds }));
  return `h.${payload.replace(/=+$/, '')}.s`;
}

describe('AuthInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let router: jasmine.SpyObj<Router>;

  const refreshUrl = (url: string) => url.endsWith('/admin/auth/refresh');
  const logoutUrl = (url: string) => url.endsWith('/admin/auth/logout');

  beforeEach(() => {
    localStorage.clear();
    router = jasmine.createSpyObj<Router>('Router', ['navigate'], { url: '/clients' });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
        { provide: Router, useValue: router },
        { provide: ConfigService, useValue: { getApiEndpoint: (path: string) => `/api/${path}` } },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    backend.verify();
    localStorage.clear();
  });

  function signIn(accessToken: string): void {
    localStorage.setItem('auth_token', accessToken);
    TestBed.inject(AuthService);
  }

  it('refreshes once for several 401s at the same time and retries each with the new token', () => {
    const old = token('old', -10);
    const fresh = token('fresh', 900);
    signIn(old);

    const results: unknown[] = [];
    http.get('/api/a').subscribe((r) => results.push(r));
    http.get('/api/b').subscribe((r) => results.push(r));

    backend.expectOne('/api/a').flush(null, { status: 401, statusText: 'Unauthorized' });
    backend.expectOne('/api/b').flush(null, { status: 401, statusText: 'Unauthorized' });

    const refresh = backend.match((r) => refreshUrl(r.url));
    expect(refresh.length).toBe(1);
    expect(refresh[0].request.body).toEqual({ accessToken: old });
    expect(refresh[0].request.headers.has('Authorization')).toBeFalse();
    refresh[0].flush({ accessToken: fresh, expiresInSeconds: 900, name: 'Ana', role: 'platform_admin' });

    for (const url of ['/api/a', '/api/b']) {
      const retried = backend.expectOne(url);
      expect(retried.request.headers.get('Authorization')).toBe(`Bearer ${fresh}`);
      retried.flush({ ok: url });
    }
    expect(results.length).toBe(2);
    expect(localStorage.getItem('auth_token')).toBe(fresh);
    expect(TestBed.inject(AuthService).getCurrentUser()?.roles).toEqual(['platform_admin']);
  });

  it('logs out when the API rejects the refresh', () => {
    signIn(token('old', -10));
    let failed = false;
    http.get('/api/a').subscribe({ error: () => (failed = true) });

    backend.expectOne('/api/a').flush(null, { status: 401, statusText: 'Unauthorized' });
    backend.expectOne((r) => refreshUrl(r.url)).flush({ code: 'INVALID_OR_EXPIRED_TOKEN' }, { status: 401, statusText: 'Unauthorized' });
    // The logout call itself must not start another refresh.
    backend.expectOne((r) => logoutUrl(r.url)).flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(failed).toBeTrue();
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('keeps the session when the refresh fails for a network error', () => {
    const old = token('old', -10);
    signIn(old);
    let failed = false;
    http.get('/api/a').subscribe({ error: () => (failed = true) });

    backend.expectOne('/api/a').flush(null, { status: 401, statusText: 'Unauthorized' });
    backend.expectOne((r) => refreshUrl(r.url)).error(new ProgressEvent('error'), { status: 0 });

    expect(failed).toBeTrue();
    expect(localStorage.getItem('auth_token')).toBe(old);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('retries with a token another tab already refreshed, without refreshing again', () => {
    const old = token('old', -10);
    const fromOtherTab = token('other', 900);
    signIn(old);
    http.get('/api/a').subscribe();

    localStorage.setItem('auth_token', fromOtherTab);
    backend.expectOne('/api/a').flush(null, { status: 401, statusText: 'Unauthorized' });

    const retried = backend.expectOne('/api/a');
    expect(retried.request.headers.get('Authorization')).toBe(`Bearer ${fromOtherTab}`);
    retried.flush({});
    expect(backend.match((r) => refreshUrl(r.url)).length).toBe(0);
  });

  it('gives up after one retry instead of looping', () => {
    signIn(token('old', -10));
    let failed = false;
    http.get('/api/a').subscribe({ error: () => (failed = true) });

    backend.expectOne('/api/a').flush(null, { status: 401, statusText: 'Unauthorized' });
    backend.expectOne((r) => refreshUrl(r.url)).flush({ accessToken: token('fresh', 900) });
    backend.expectOne('/api/a').flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(failed).toBeTrue();
    expect(backend.match((r) => refreshUrl(r.url)).length).toBe(0);
  });

  it('refreshes right away on start when the stored token is about to expire', (done) => {
    signIn(token('old', 30));
    setTimeout(() => {
      backend.expectOne((r) => refreshUrl(r.url)).flush({ accessToken: token('fresh', 900) });
      expect(localStorage.getItem('auth_token')).not.toBeNull();
      done();
    });
  });
});
