export interface ShareResult { id: string; url: string; reused?: boolean }
export interface ShareProgress {
  phase: "checking" | "uploading" | "publishing";
  bytes: number;
  total: number;
  version: number;
  versions: number;
}
export interface SharedLink extends ShareResult {
  title: string;
  createdAt: string;
  expiresAt?: string;
  filenames: string[];
  bytes: number;
}
export interface SharedLinksPage { shares: SharedLink[]; cursor?: string }
export function filenameSignature(filenames: string[]): string {
  return JSON.stringify([...filenames].sort());
}
