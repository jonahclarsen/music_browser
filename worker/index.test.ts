import { describe, expect, it } from "vitest";
import worker, { parseRange, randomId, type Env } from "./index";

function fixture() {
  const objects = new Map<string, { data: Uint8Array; httpMetadata?: { contentType: string } }>();
  const wrap = (stored: { data: Uint8Array; httpMetadata?: { contentType: string } }) => ({
    uploaded: new Date("2026-09-01T12:00:00Z"),
    size: stored.data.length, httpMetadata: stored.httpMetadata, httpEtag: '"test"',
    body: new Response(stored.data).body,
    json: async () => JSON.parse(new TextDecoder().decode(stored.data)),
  });
  const env = { UPLOAD_TOKEN: "secret", SONGS: {
    async put(key: string, body: string | ReadableStream, options?: { onlyIf?: unknown; httpMetadata?: { contentType: string } }) {
      if (options?.onlyIf && objects.has(key)) return null;
      const data = new Uint8Array(await new Response(body).arrayBuffer());
      const stored = { data, httpMetadata: options?.httpMetadata };
      objects.set(key, stored); return wrap(stored);
    },
    async get(key: string, options?: { range: { offset: number; length: number } }) {
      const value = objects.get(key);
      if (!value) return null;
      if (options?.range) return wrap({ ...value, data: value.data.slice(options.range.offset, options.range.offset + options.range.length) });
      return wrap(value);
    },
    async head(key: string) { const value = objects.get(key); return value ? wrap(value) : null; },
    async list({ prefix, limit, cursor }: { prefix: string; limit: number; cursor?: string }) {
      const keys = [...objects.keys()].filter(key => key.startsWith(prefix) && (!cursor || key > cursor)).sort();
      const page = keys.slice(0, limit);
      return { objects: page.map(key => ({ key, ...wrap(objects.get(key)!) })), truncated: keys.length > limit, cursor: page.at(-1) };
    },
    async delete(keys: string | string[]) { (Array.isArray(keys) ? keys : [keys]).forEach(key => objects.delete(key)); },
  } } as unknown as Env;
  const call = (route: string, method = "GET", body?: string, authenticated = false, headers = {}) => worker.fetch(new Request(`https://music.example${route}`, {
    method, body, headers: { ...(authenticated ? { Authorization: "Bearer secret" } : {}), ...headers },
  }), env);
  return { call, objects, env };
}
const song = { title: '<script>alert("x")</script>', latest: 1, versions: [
  { label: "Old v1.0.mp3", size: 5, contentType: "audio/mpeg" },
  { modifiedAt: Date.UTC(2026, 8, 10), label: "Latest v2.0.wav", size: 6, contentType: "audio/wav" },
] };

describe("sharing worker", () => {
  it("publishes all versions atomically, defaults to latest, and serves case-insensitive links and seeking", async () => {
    const { call } = fixture();
    expect((await call("/api/shares", "POST", JSON.stringify(song))).status).toBe(401);
    const draft = await call("/api/shares", "POST", JSON.stringify(song), true);
    expect(draft.status).toBe(201);
    const { id } = await draft.json() as { id: string };
    expect(id).toMatch(/^[a-z]{8}$/);
    expect((await call(`/${id}`)).status).toBe(404);
    expect((await call(`/api/shares/${id}/publish`, "POST", undefined, true)).status).toBe(409);
    for (const [index, v] of song.versions.entries()) {
      expect((await call(`/api/shares/${id}/audio/${index}`, "PUT", "abcdef".slice(0, v.size), true, { "Content-Type": v.contentType, "Content-Length": String(v.size) })).status).toBe(200);
    }
    expect((await call(`/${id}/audio/0`)).status).toBe(404);
    expect((await call(`/api/shares/${id}/publish`, "POST", undefined, true)).status).toBe(201);
    const page = await call(`/${id.toUpperCase()}`);
    const html = await page.text();
    expect(html).toContain(`src="/${id}/audio/1"`);
    expect(html).toContain("<details><summary>Explore all 2 versions");
    expect(html).not.toContain("<details open");
    expect(html).not.toContain("autoplay");
    expect(html).toContain("JONAH SHARED WITH YOU");
    expect(html).toContain('aria-label="Play"');
    expect(html).toContain('<footer aria-label="Song player">');
    expect(html).toContain("Latest version");
    expect(html).toContain('src="/player.js" type="module"');
    expect(html).toContain('/fonts/roboto-mono-latin-400-normal.woff2');
    expect(html).toContain('href="/waveform.css"');
    expect(page.headers.get("Content-Security-Policy")).toContain("connect-src 'self'");
    expect(page.headers.get("Content-Security-Policy")).toContain("font-src 'self'");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain('datetime="2026-09-10T00:00:00.000Z"');
    expect(html).toContain("Date unavailable");
    expect(page.headers.get("Content-Security-Policy")).toContain("script-src 'self'");
    const script = await call("/player.js");
    expect(script.headers.get("Content-Type")).toContain("text/javascript");
    expect(await script.text()).toContain("audio.currentTime = Number(seek.value)");
    const match = await call("/api/shares/find", "POST", JSON.stringify({ filenames: song.versions.map(v => v.label), dates: [Date.UTC(2025, 0, 1), Date.UTC(2026, 0, 1)] }), true);
    expect((await match.json() as { id: string }).id).toBe(id);
    const updated = await (await call(`/${id}`)).text();
    expect(updated).toContain('datetime="2025-01-01T00:00:00.000Z"');
    expect(updated).toContain('datetime="2026-09-10T00:00:00.000Z"');
    expect(page.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(await (await call(`/${id}?version=0`)).text()).toContain(`src="/${id}/audio/0"`);
    expect(await (await call(`/${id}?version=-2`)).text()).toContain(`src="/${id}/audio/1"`);
    const audio = await call(`/${id.toUpperCase()}/audio/1`, "GET", undefined, false, { Range: "bytes=2-4" });
    expect(audio.status).toBe(206);
    expect(audio.headers.get("Content-Range")).toBe("bytes 2-4/6");
    expect(await audio.text()).toBe("cde");
    const head = await call(`/${id}/audio/1`, "HEAD");
    expect(head.headers.get("Content-Length")).toBe("6");
    expect(await head.text()).toBe("");
    expect((await call(`/${id}/audio/1`, "GET", undefined, false, { Range: "bytes=6-" })).status).toBe(416);
    expect((await call(`/api/shares/${id}`, "DELETE", undefined, true)).status).toBe(409);
    expect((await call("/")).status).toBe(404);
  });
  it("cleans failed uploads without making them publicly accessible", async () => {
    const { call, objects } = fixture();
    const { id } = await (await call("/api/shares", "POST", JSON.stringify(song), true)).json() as { id: string };
    await call(`/api/shares/${id}/audio/0`, "PUT", "abcde", true, { "Content-Type": "audio/mpeg", "Content-Length": "5" });
    expect((await call(`/api/shares/${id}`, "DELETE", undefined, true)).status).toBe(200);
    expect(objects.has(`audio/${id}/0`)).toBe(false);
    expect(objects.has(`drafts/${id}`)).toBe(true);
    expect((await call(`/${id}`)).status).toBe(404);
  });
  it("rejects invalid metadata and upload sizes", async () => {
    const { call } = fixture();
    for (const body of [null, {}, { ...song, latest: 8 }, { ...song, versions: [] }]) {
      expect((await call("/api/shares", "POST", JSON.stringify(body), true)).status).toBe(400);
    }
    const { id } = await (await call("/api/shares", "POST", JSON.stringify(song), true)).json() as { id: string };
    expect((await call(`/api/shares/${id}/audio/0`, "PUT", "abc", true, { "Content-Type": "audio/mpeg", "Content-Length": "3" })).status).toBe(400);
  });
  it("finds legacy shares across pages by filename multiset, ignoring order, title and sizes", async () => {
    const { call, objects } = fixture();
    for (let i = 0; i < 28; i++) {
      const id = `aaaaaaa${String.fromCharCode(97 + i % 26)}`;
      objects.set(`shares/${id}`, { data: new TextEncoder().encode(JSON.stringify({ ...song, title: "Other", versions: [{ label: `Other ${i}.mp3`, size: 1, contentType: "audio/mpeg" }] })) });
    }
    objects.set("shares/zzzzzzzz", { data: new TextEncoder().encode(JSON.stringify(song)) });
    const first = await (await call("/api/shares", "GET", undefined, true)).json() as { shares: unknown[]; cursor: string };
    expect(first.shares).toHaveLength(25);
    expect(first.cursor).toBeTruthy();
    const second = await (await call(`/api/shares?cursor=${first.cursor}`, "GET", undefined, true)).json() as { shares: { id: string; createdAt: string }[] };
    expect(second.shares.some(s => s.id === "zzzzzzzz")).toBe(true);
    expect(second.shares[0].createdAt).toBe("2026-09-01T12:00:00.000Z");
    const find = await call("/api/shares/find", "POST", JSON.stringify({ filenames: song.versions.map(v => v.label).reverse() }), true);
    expect(await find.json()).toEqual({ id: "zzzzzzzz", url: "https://music.example/zzzzzzzz", reused: true });
    const create = await call("/api/shares", "POST", JSON.stringify({ ...song, title: "Changed", versions: song.versions.map(v => ({ ...v, size: 99 })).reverse() }), true);
    expect((await create.json() as { id: string }).id).toBe("zzzzzzzz");
    const changed = await call("/api/shares/find", "POST", JSON.stringify({ filenames: ["different.mp3"] }), true);
    expect(await changed.json()).toEqual({});
    for (const route of ["/api/shares", "/api/shares/find", "/api/shares/zzzzzzzz/revoke"]) expect((await call(route)).status).toBe(401);
  });
  it("revokes all audio, prevents republishing and excludes deleted shares from reuse", async () => {
    const { call, objects } = fixture();
    const data = new TextEncoder().encode(JSON.stringify(song));
    objects.set("drafts/abcdefgh", { data }); objects.set("shares/abcdefgh", { data });
    objects.set("audio/abcdefgh/0", { data: new Uint8Array(5) }); objects.set("audio/abcdefgh/1", { data: new Uint8Array(6) });
    expect((await call("/api/shares/abcdefgh/revoke", "POST", undefined, true)).status).toBe(200);
    expect(objects.has("deleted/abcdefgh")).toBe(true);
    expect(objects.has("shares/abcdefgh")).toBe(false);
    expect(objects.has("audio/abcdefgh/0")).toBe(false);
    expect(objects.has("audio/abcdefgh/1")).toBe(false);
    expect((await call("/abcdefgh/audio/0")).status).toBe(404);
    expect((await call("/api/shares/abcdefgh/publish", "POST", undefined, true)).status).toBe(410);
    expect(await (await call("/api/shares/find", "POST", JSON.stringify({ filenames: song.versions.map(v => v.label) }), true)).json()).toEqual({});
  });
  it("updates expiry, blocks expired playback and removes expired audio on schedule", async () => {
    const { call, objects, env } = fixture();
    const data = new TextEncoder().encode(JSON.stringify(song));
    objects.set("drafts/abcdefgh", { data }); objects.set("shares/abcdefgh", { data });
    objects.set("audio/abcdefgh/0", { data: new Uint8Array(5) });
    const expiresAt = new Date(Date.now() + 86400000).toISOString();
    expect((await call("/api/shares/abcdefgh/expiry", "POST", JSON.stringify({ expiresAt }), true)).status).toBe(200);
    expect((await call("/abcdefgh")).status).toBe(200);
    expect((await call("/api/shares/abcdefgh/expiry", "POST", JSON.stringify({ expiresAt: null }), true)).status).toBe(200);
    expect((await call("/api/shares/abcdefgh/expiry", "POST", JSON.stringify({ expiresAt: "invalid" }), true)).status).toBe(400);
    objects.set("shares/abcdefgh", { data: new TextEncoder().encode(JSON.stringify({ ...song, expiresAt: "2000-01-01T00:00:00Z" })) });
    expect((await call("/abcdefgh")).status).toBe(404);
    expect(await (await call("/api/shares/find", "POST", JSON.stringify({ filenames: song.versions.map(v => v.label) }), true)).json()).toEqual({});
    await worker.scheduled({}, env);
    expect(objects.has("shares/abcdefgh")).toBe(false);
    expect(objects.has("audio/abcdefgh/0")).toBe(false);
  });
  it("generates eight lowercase letters and handles suffix and invalid ranges", () => {
    expect(new Set(Array.from({ length: 1000 }, randomId)).size).toBe(1000);
    expect(parseRange("bytes=-3", 10)).toEqual({ offset: 7, length: 3 });
    expect(parseRange("bytes=4-", 10)).toEqual({ offset: 4, length: 6 });
    expect(parseRange("bytes=0-99", 10)).toEqual({ offset: 0, length: 10 });
    for (const value of ["bytes=-0", "bytes=10-", "bytes=4-2", "bytes=0-1,3-4", "bytes=-", "bytes=99999999999999999999-"]) expect(parseRange(value, 10)).toBeNull();
  });
});
