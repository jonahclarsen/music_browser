import { filenameSignature, type SharedLinksPage, type SharedLink } from "../src/lib/sharing";
import type { R2Bucket } from "@cloudflare/workers-types";

export interface Env { SONGS: R2Bucket; UPLOAD_TOKEN: string }
export const MAX_BYTES = 95 * 1024 * 1024;
const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; media-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
};
function reply(body: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { ...securityHeaders, ...headers } });
}
function json(body: unknown, status = 200): Response {
  return reply(JSON.stringify(body), status, { "Content-Type": "application/json" });
}
export function randomId(): string {
  let id = "";
  while (id.length < 8) {
    for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
      if (byte < 234) id += String.fromCharCode(97 + byte % 26);
      if (id.length === 8) break;
    }
  }
  return id;
}
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}
export function parseRange(value: string, size: number): { offset: number; length: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  const first = Number(match[1]);
  const last = Number(match[2]);
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) return null;
  const offset = match[1] ? first : Math.max(0, size - last);
  const end = match[1] && match[2] ? Math.min(last, size - 1) : size - 1;
  return offset >= size || end < offset ? null : { offset, length: end - offset + 1 };
}
export interface SharedSong {
  title: string;
  createdAt?: string;
  expiresAt?: string;
  latest: number;
  versions: { label: string; size: number; contentType: "audio/mpeg" | "audio/wav" }[];
}
function playerPage(song: SharedSong, id: string, selected: number): string {
  const older = song.versions.map((version, index) => `<a href="/${id}?version=${index}" ${index === selected ? 'aria-current="true"' : ''}>${escapeHtml(version.label)}${index === selected ? " (selected)" : ""}</a>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(song.title)}</title><style>
  *{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;padding:24px;background:#eef2f5;color:#25313c;font-family:"Avenir Next",system-ui,sans-serif}main{width:min(100%,560px);padding:clamp(24px,6vw,48px);background:#ffffffc9;border:1px solid #fff;border-radius:24px;box-shadow:0 24px 80px #24334112}p{font-size:11px;letter-spacing:.16em;color:#6a7d87;margin:0 0 12px}h1{font-size:clamp(26px,6vw,38px);line-height:1.2;overflow-wrap:anywhere;margin:0 0 12px;font-weight:600}audio{width:100%;display:block;margin-top:24px}.version{font-size:13px;overflow-wrap:anywhere;color:#6a7d87}details{margin-top:28px}summary{cursor:pointer;font-size:14px}nav{display:grid;gap:6px;margin-top:12px;max-height:280px;overflow:auto}a{color:#396f86;text-decoration:none;padding:10px;border-radius:8px;font-size:14px;overflow-wrap:anywhere}a:hover,a[aria-current]{background:#e0edf3}
  </style></head><body><main><p>JONAH SHARED WITH YOU</p><h1>${escapeHtml(song.title)}</h1><div class="version">${escapeHtml(song.versions[selected].label)}</div><audio controls preload="metadata" src="/${id}/audio/${selected}">Your browser does not support audio playback.</audio>${song.versions.length > 1 ? `<details><summary>Explore all ${song.versions.length} versions</summary><nav aria-label="Song versions">${older}</nav></details>` : ""}</main></body></html>`;
}
export function validSong(value: unknown): value is SharedSong {
  if (!value || typeof value !== "object") return false;
  const song = value as SharedSong;
  return typeof song.title === "string" && song.title.trim().length > 0 && song.title.length <= 200
    && Array.isArray(song.versions) && song.versions.length > 0 && song.versions.length <= 200
    && Number.isInteger(song.latest) && song.latest >= 0 && song.latest < song.versions.length
    && song.versions.every(v => v && typeof v.label === "string" && v.label.length > 0 && v.label.length <= 300
      && Number.isSafeInteger(v.size) && v.size > 0 && v.size <= MAX_BYTES && ["audio/mpeg", "audio/wav"].includes(v.contentType));
}
function isExpired(song: SharedSong): boolean {
  return Boolean(song.expiresAt && Date.parse(song.expiresAt) <= Date.now());
}
async function sharePage(env: Env, origin: string, cursor?: string): Promise<SharedLinksPage> {
  const listed = await env.SONGS.list({ prefix: "shares/", limit: 25, cursor });
  const shares: SharedLink[] = [];
  for (const object of listed.objects) {
    const manifest = await env.SONGS.get(object.key);
    if (!manifest) continue;
    const song = await manifest.json<SharedSong>();
    const id = object.key.slice(7);
    if (await env.SONGS.head(`deleted/${id}`)) continue;
    shares.push({ id, url: `${origin}/${id}`, title: song.title,
      createdAt: song.createdAt ?? object.uploaded.toISOString(), expiresAt: song.expiresAt,
      filenames: song.versions.map(v => v.label), bytes: song.versions.reduce((sum, v) => sum + v.size, 0),
    });
  }
  return { shares, cursor: listed.truncated ? listed.cursor : undefined };
}
async function findShare(env: Env, origin: string, filenames: string[]): Promise<SharedLink | undefined> {
  const signature = filenameSignature(filenames);
  let cursor: string | undefined;
  do {
    const page = await sharePage(env, origin, cursor);
    const found = page.shares.find(share => (!share.expiresAt || Date.parse(share.expiresAt) > Date.now()) && filenameSignature(share.filenames) === signature);
    if (found) return found;
    cursor = page.cursor;
  } while (cursor);
}
async function revoke(env: Env, id: string, song: SharedSong): Promise<void> {
  // Revoke access first, even if an R2 deletion fails. Keep a tombstone to prevent republishing.
  await env.SONGS.put(`deleted/${id}`, "");
  await env.SONGS.delete(song.versions.map((_, i) => `audio/${id}/${i}`));
  await env.SONGS.delete(`shares/${id}`);
}
export default {
  async scheduled(_controller: unknown, env: Env): Promise<void> {
    let cursor: string | undefined;
    do {
      const listed = await env.SONGS.list({ prefix: "shares/", limit: 100, cursor });
      for (const object of listed.objects) {
        const manifest = await env.SONGS.get(object.key);
        if (!manifest) continue;
        const song = await manifest.json<SharedSong>();
        if (isExpired(song) || await env.SONGS.head(`deleted/${object.key.slice(7)}`)) await revoke(env, object.key.slice(7), song);
      }
      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      if (!env.UPLOAD_TOKEN || request.headers.get("Authorization") !== `Bearer ${env.UPLOAD_TOKEN}`) return json({ error: "Unauthorized" }, 401);
      if (url.pathname === "/api/shares" && request.method === "GET") return json(await sharePage(env, url.origin, url.searchParams.get("cursor") ?? undefined));
      if (url.pathname === "/api/shares/find" && request.method === "POST") {
        const body = await request.json().catch(() => null) as { filenames?: unknown } | null;
        const names = body?.filenames;
        if (!Array.isArray(names) || !names.length || names.length > 200 || !names.every(name => typeof name === "string" && name.length <= 300)) return json({ error: "Invalid filenames." }, 400);
        const found = await findShare(env, url.origin, names);
        return json(found ? { id: found.id, url: found.url, reused: true } : {});
      }
      if (url.pathname === "/api/shares" && request.method === "POST") {
        if (Number(request.headers.get("Content-Length")) > 100_000) return json({ error: "Too much metadata." }, 413);
        const song: unknown = await request.json().catch(() => null);
        if (!validSong(song)) return json({ error: "Invalid song metadata (maximum 200 versions, 95 MiB each)." }, 400);
        const found = await findShare(env, url.origin, song.versions.map(v => v.label));
        if (found) return json({ id: found.id, url: found.url, reused: true });
        delete song.expiresAt;
        song.createdAt = new Date().toISOString();
        for (let attempt = 0; attempt < 5; attempt++) {
          const id = randomId();
          const stored = await env.SONGS.put(`drafts/${id}`, JSON.stringify(song), { onlyIf: { etagDoesNotMatch: "*" } });
          if (stored) return json({ id }, 201);
        }
        return json({ error: "Could not allocate a link. Try again." }, 503);
      }
      const route = /^\/api\/shares\/([a-z]{8})(?:\/(publish|revoke|expiry|audio\/(\d+)))?$/.exec(url.pathname);
      if (!route) return json({ error: "Not found" }, 404);
      const id = route[1];
      const draft = await env.SONGS.get(`drafts/${id}`);
      if (!draft) return json({ error: "Upload not found" }, 404);
      const song = await draft.json<SharedSong>();
      if (route[2] === "revoke" && request.method === "POST") {
        await revoke(env, id, song);
        return json({ ok: true });
      }
      if (await env.SONGS.head(`deleted/${id}`)) return json({ error: "This share was deleted." }, 410);
      const published = await env.SONGS.get(`shares/${id}`);
      if (route[2] === "expiry" && request.method === "POST") {
        if (!published) return json({ error: "Share not found." }, 404);
        const body = await request.json().catch(() => null) as { expiresAt?: unknown } | null;
        if (!body || !("expiresAt" in body) || (body.expiresAt !== null && (typeof body.expiresAt !== "string" || !Number.isFinite(Date.parse(body.expiresAt)) || Date.parse(body.expiresAt) <= Date.now()))) return json({ error: "Choose a future expiry date or no expiry." }, 400);
        const current = await published.json<SharedSong>();
        if (body.expiresAt === null) delete current.expiresAt;
        else current.expiresAt = new Date(body.expiresAt as string).toISOString();
        await env.SONGS.put(`shares/${id}`, JSON.stringify(current));
        return json({ ok: true });
      }
      if (published) {
        if (route[2] === "publish" && request.method === "POST") return json({ id, url: `${url.origin}/${id}` });
        return json({ error: "This share is already published." }, 409);
      }
      if (request.method === "DELETE" && !route[2]) {
        await env.SONGS.delete(song.versions.map((_, i) => `audio/${id}/${i}`));
        // Keep the reservation to prevent a failed share ID from ever being reused.
        return json({ ok: true });
      }
      if (request.method === "PUT" && route[3] !== undefined) {
        const index = Number(route[3]);
        const version = song.versions[index];
        if (!version || request.headers.get("Content-Type") !== version.contentType || Number(request.headers.get("Content-Length")) !== version.size || !request.body) return json({ error: "Audio does not match the selected version." }, 400);
        await env.SONGS.put(`audio/${id}/${index}`, request.body as never, { httpMetadata: { contentType: version.contentType } });
        return json({ ok: true });
      }
      if (request.method === "POST" && route[2] === "publish") {
        for (const [index, version] of song.versions.entries()) {
          const audio = await env.SONGS.head(`audio/${id}/${index}`);
          if (!audio || audio.size !== version.size) return json({ error: "Upload is incomplete." }, 409);
        }
        await env.SONGS.put(`shares/${id}`, JSON.stringify(song), { onlyIf: { etagDoesNotMatch: "*" } });
        return json({ id, url: `${url.origin}/${id}` }, 201);
      }
      return json({ error: "Method not allowed" }, 405);
    }
    if (request.method !== "GET" && request.method !== "HEAD") return reply("Method not allowed", 405, { Allow: "GET, HEAD" });
    const match = /^\/([a-z]{8})(?:\/audio\/(\d+))?\/?$/i.exec(url.pathname);
    if (!match) return reply("This shared song could not be found.", 404);
    const id = match[1].toLowerCase();
    const manifest = await env.SONGS.get(`shares/${id}`);
    if (!manifest || await env.SONGS.head(`deleted/${id}`)) return reply("This shared song is no longer available.", 404);
    const song = await manifest.json<SharedSong>();
    if (isExpired(song)) return reply("This shared song has expired.", 404);
    if (match[2] === undefined) {
      const requested = url.searchParams.has("version") ? Number(url.searchParams.get("version")) : song.latest;
      const selected = Number.isInteger(requested) && requested >= 0 && requested < song.versions.length ? requested : song.latest;
      return reply(request.method === "HEAD" ? "" : playerPage(song, id, selected), 200, { "Content-Type": "text/html; charset=utf-8" });
    }
    const index = Number(match[2]);
    if (!song.versions[index]) return reply("Version not found", 404);
    const metadata = await env.SONGS.head(`audio/${id}/${index}`);
    if (!metadata) return reply("This version is no longer available.", 404);
    const rangeHeader = request.headers.get("Range");
    const range = rangeHeader ? parseRange(rangeHeader, metadata.size) : undefined;
    if (range === null) return reply("Invalid range", 416, { "Content-Range": `bytes */${metadata.size}` });
    const headers = new Headers({ ...securityHeaders,
      "Content-Type": metadata.httpMetadata?.contentType ?? "audio/mpeg",
      "Accept-Ranges": "bytes", "Content-Length": String(range?.length ?? metadata.size), "ETag": metadata.httpEtag,
    });
    if (range) headers.set("Content-Range", `bytes ${range.offset}-${range.offset + range.length - 1}/${metadata.size}`);
    if (request.method === "HEAD") return new Response(null, { status: range ? 206 : 200, headers });
    const object = await env.SONGS.get(`audio/${id}/${index}`, range ? { range } : undefined);
    if (!object) return reply("This version is no longer available.", 404);
    return new Response(object.body as unknown as ReadableStream, { status: range ? 206 : 200, headers });
  },
};
