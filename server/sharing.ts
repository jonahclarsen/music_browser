import { createReadStream, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { mediaRegistry, songRegistry } from "./library.js";

export const sharingConfigPath = path.join(os.homedir(), ".config", "music-browser", "sharing.json");
const MAX_BYTES = 95 * 1024 * 1024;
const pending = new Map<string, Promise<{ id: string; url: string }>>();

export function shareSong(trackId: string): Promise<{ id: string; url: string }> {
  const song = songRegistry.get(trackId);
  if (!song) return Promise.reject(new Error("That song is no longer in the scanned library. Scan again first."));
  const existing = pending.get(song.id);
  if (existing) return existing;
  const job = uploadSong(trackId).finally(() => pending.delete(song.id));
  pending.set(song.id, job);
  return job;
}
async function uploadSong(trackId: string): Promise<{ id: string; url: string }> {
  const song = songRegistry.get(trackId)!;
  let config: { url?: string; token?: string } = {};
  try { config = JSON.parse(await fs.readFile(sharingConfigPath, "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const url = process.env.MUSIC_BROWSER_SHARE_URL ?? config.url;
  const token = process.env.MUSIC_BROWSER_SHARE_TOKEN ?? config.token;
  if (!url || !token) throw new Error("Song sharing is not configured. See the Sharing section in README.md.");
  const base = new URL(url);
  if (base.protocol !== "https:") throw new Error("The sharing worker must use HTTPS.");
  // Check every file before creating a remote draft.
  const files = await Promise.all(song.versions.map(async (version) => {
    const file = mediaRegistry.get(version.id);
    if (!file) throw new Error("A version is missing. Scan the library again.");
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size === 0 || stat.size > MAX_BYTES) throw new Error(`${version.filename} cannot be shared: each version must be between 1 byte and 95 MiB.`);
    return { file, label: version.filename, size: stat.size, contentType: version.format === "mp3" ? "audio/mpeg" : "audio/wav" };
  }));
  async function remote(endpoint: string, options: RequestInit): Promise<{ id?: string; url?: string }> {
    const response = await fetch(new URL(endpoint, base), {
      ...options, redirect: "error", signal: AbortSignal.timeout(5 * 60 * 1000),
      headers: { ...options.headers, Authorization: `Bearer ${token}` },
    });
    const result = await response.json().catch(() => ({})) as { id?: string; url?: string; error?: string };
    if (!response.ok) throw new Error(result.error ?? `Sharing failed (${response.status}). Try again.`);
    return result;
  }
  const draft = await remote("/api/shares", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: song.name, latest: song.versions.findIndex(v => v.id === song.latest.id), versions: files.map(({ file: _file, ...metadata }) => metadata) }),
  });
  if (!draft.id || !/^[a-z]{8}$/.test(draft.id)) throw new Error("The sharing worker returned an invalid ID.");
  const id = draft.id;
  try {
    for (const [index, file] of files.entries()) {
      const stream = createReadStream(file.file);
      try {
        await remote(`/api/shares/${id}/audio/${index}`, {
          method: "PUT", headers: { "Content-Type": file.contentType, "Content-Length": String(file.size) },
          body: stream, duplex: "half",
        } as unknown as RequestInit);
      } finally { stream.destroy(); }
    }
    const result = await remote(`/api/shares/${id}/publish`, { method: "POST" });
    if (result.url !== `${base.origin}/${id}`) throw new Error("The sharing worker returned an invalid link.");
    return { id, url: result.url };
  } catch (error) {
    // The worker refuses cleanup if publication succeeded but its response was lost.
    await remote(`/api/shares/${id}`, { method: "DELETE" }).catch(() => {});
    throw error;
  }
}
