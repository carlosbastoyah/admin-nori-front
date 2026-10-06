export type DesktopReleaseStatus = 'draft' | 'published' | 'withdrawn';

export interface DesktopReleaseAsset {
  platform: string;
  storageKey: string;
  sizeBytes: number | null;
}

export interface DesktopRelease {
  id: string;
  version: string;
  notes: string | null;
  status: DesktopReleaseStatus;
  isMandatory: boolean;
  createdAt: string;
  updatedAt: string | null;
  publishedAt: string | null;
  /** Set once the installers were removed from storage; the release can no longer be published. */
  filesDeletedAt: string | null;
  assets: DesktopReleaseAsset[];
}

export interface UpdateDesktopReleaseRequest {
  notes?: string | null;
  isMandatory?: boolean;
}
