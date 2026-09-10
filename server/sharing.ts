import { createReadStream, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { mediaRegistry, songRegistry } from "./library.js";
import { filenameSignature, type ShareProgress, type ShareResult, type SharedLinksPage } from "../src/lib/sharing.js";

export const sharingConfigPath = path.join(os.homedir(), ".config", "music-browser", "sharing.json");
const MAX_BYTES = 95 * 1024 * 1024;
type ProgressListener = (progress: ShareProgress) => void;
interface UploadJob { result: Promise<ShareResult>; progress: ShareProgress; listeners: Set<ProgressListener> }
const pending = new Map<string, UploadJob>();

async function connection() {
  let config: { url?: string; token?: string } = {};
  try { config = JSON.parse(await fs.readFile(sharingConfigPath, "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const url = process.env.MUSIC_BROWSER_SHARE_URL ?? config.url;
  const token = process.env.MUSIC_BROWSER_SHARE_TOKEN ?? config.token;
  if (!url || !token) throw new Error("Song sharing is not configured. See the Sharing section in README.md.");
  const base = new URL(url);
  if (base.protocol !== "https:") throw new Error("The sharing worker must use HTTPS.");
  return {
    base,
    async remote<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
      const response = await fetch(new URL(endpoint, base), {
        ...options, redirect: "error", signal: AbortSignal.timeout(5 * 60 * 1000),
        headers: { ...options.headers, Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({})) as T & { error?: string };
      if (!response.ok) throw new Error(result.error ?? `Sharing failed (${response.status}). Try again.`);
      return result;
    },
  };
}
export async function listSharedSongs(cursor?: string): Promise<SharedLinksPage> {
  const { remote } = await connection();
  return remote(`/api/shares${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
}
export async function manageSharedSong(id: string, action: "revoke" | "expiry", expiresAt?: string | null): Promise<void> {
  if (!/^[a-z]{8}$/.test(id)) throw new Error("Invalid share ID.");
  const { remote } = await connection();
  await remote(`/api/shares/${id}/${action}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expiresAt }),
  });
}
export function shareSong(trackId: string, onprogress: ProgressListener = () => {}): Promise<ShareResult> {
  const song = songRegistry.get(trackId);
  if (!song) return Promise.reject(new Error("That song is no longer in the scanned library. Scan again first."));
  const key = filenameSignature(song.versions.map(v => v.filename));
  const existing = pending.get(key);
  if (existing) {
    existing.listeners.add(onprogress);
    onprogress(existing.progress);
    return existing.result;
  }
  const job: UploadJob = {
    result: undefined as unknown as Promise<ShareResult>,
    progress: { phase: "checking", bytes: 0, total: 0, version: 0, versions: song.versions.length },
    listeners: new Set([onprogress]),
  };
  function report(progress: ShareProgress) {
    job.progress = { ...progress };
    job.listeners.forEach(listener => listener(job.progress));
  }
  report(job.progress);
  job.result = uploadSong(trackId, report).finally(() => pending.delete(key));
  pending.set(key, job);
  return job.result;
}
async function uploadSong(trackId: string, report: ProgressListener): Promise<ShareResult> {
  const song = songRegistry.get(trackId)!;
  const { base, remote } = await connection();
  function result(value: Partial<ShareResult>): ShareResult {
    if (!value.id || !/^[a-z]{8}$/.test(value.id) || value.url !== `${base.origin}/${value.id}`) throw new Error("The sharing worker returned an invalid link.");
    return value as ShareResult;
  }
  // Filename-only matching is intentional: do not hash or compare audio contents.
  const found = await remote<Partial<ShareResult>>("/api/shares/find", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filenames: song.versions.map(v => v.filename), dates: song.versions.map(v => v.modifiedAt) }),
  });
  if (found.url) return result(found);
  const files = await Promise.all(song.versions.map(async (version) => {
    const file = mediaRegistry.get(version.id);
    if (!file) throw new Error("A version is missing. Scan the library again.");
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size === 0 || stat.size > MAX_BYTES) throw new Error(`${version.filename} cannot be shared: each version must be between 1 byte and 95 MiB.`);
    return { file, label: version.filename, modifiedAt: version.modifiedAt, size: stat.size, contentType: version.format === "mp3" ? "audio/mpeg" : "audio/wav" };
  }));
  const draft = await remote<Partial<ShareResult>>("/api/shares", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: song.name, latest: song.versions.findIndex(v => v.id === song.latest.id), versions: files.map(({ file: _file, ...metadata }) => metadata) }),
  });
  if (draft.url) return result(draft);
  if (!draft.id || !/^[a-z]{8}$/.test(draft.id)) throw new Error("The sharing worker returned an invalid ID.");
  const id = draft.id;
  const progress: ShareProgress = { phase: "uploading", bytes: 0, total: files.reduce((sum, file) => sum + file.size, 0), version: 0, versions: files.length };
  try {
    let confirmed = 0;
    for (const [index, file] of files.entries()) {
      progress.version = index + 1;
      report(progress);
      const stream = createReadStream(file.file);
      let lastReport = 0;
      let sent = 0;
      async function* chunks() {
        for await (const chunk of stream) {
          sent += chunk.length;
          progress.bytes = confirmed + Math.min(sent, file.size);
          if (Date.now() - lastReport >= 100) { report(progress); lastReport = Date.now(); }
          yield chunk;
        }
      }
      try {
        await remote(`/api/shares/${id}/audio/${index}`, {
          method: "PUT", headers: { "Content-Type": file.contentType, "Content-Length": String(file.size) },
          body: chunks(), duplex: "half",
        } as unknown as RequestInit);
      } finally { stream.destroy(); }
      confirmed += file.size;
      progress.bytes = confirmed;
      report(progress);
    }
    report({ ...progress, phase: "publishing" });
    return result(await remote<ShareResult>(`/api/shares/${id}/publish`, { method: "POST" }));
  } catch (error) {
    // Draft cleanup must never revoke a published link if the publish response was lost.
    await remote(`/api/shares/${id}`, { method: "DELETE" }).catch(() => {});
    throw error;
  }
}
