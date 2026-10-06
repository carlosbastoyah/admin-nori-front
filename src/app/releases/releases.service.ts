import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpService } from '@nori/core';
import { DesktopRelease, UpdateDesktopReleaseRequest } from './models/desktop-release.models';

/** Nori desktop releases: CI registers drafts; publishing here is what makes installed apps update. */
@Injectable({ providedIn: 'root' })
export class ReleasesService {
  private readonly http = inject(HttpService);
  private readonly base = '/administration/admin/desktop-releases';

  list(): Observable<DesktopRelease[]> {
    return this.http.get<DesktopRelease[]>(this.base);
  }

  update(id: string, request: UpdateDesktopReleaseRequest): Observable<DesktopRelease> {
    return this.http.patch<DesktopRelease>(`${this.base}/${id}`, request);
  }

  publish(id: string): Observable<DesktopRelease> {
    return this.http.post<DesktopRelease>(`${this.base}/${id}/publish`, {});
  }

  withdraw(id: string): Observable<DesktopRelease> {
    return this.http.post<DesktopRelease>(`${this.base}/${id}/withdraw`, {});
  }
}
