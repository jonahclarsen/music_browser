import { describe, expect, it } from "vitest";
import worker, { parseRange, randomId, type Env } from "./index";

function fixture() {
  const objects = new Map<string, { data: Uint8Array; httpMetadata?: { contentType: string } }>();
  const wrap = (stored: { data: Uint8Array; httpMetadata?: { contentType: string } }) => ({
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
    async delete(keys: string[]) { keys.forEach(key => objects.delete(key)); },
  } } as unknown as Env;
  const call = (route: string, method = "GET", body?: string, authenticated = false, headers = {}) => worker.fetch(new Request(`https://music.example${route}`, {
    method, body, headers: { ...(authenticated ? { Authorization: "Bearer secret" } : {}), ...headers },
  }), env);
  return { call, objects };
}
const song = { title: '<script>alert("x")</script>', latest: 1, versions: [
  { label: "Old v1.0.mp3", size: 5, contentType: "audio/mpeg" },
  { label: "Latest v2.0.wav", size: 6, contentType: "audio/wav" },
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
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
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
  it("generates eight lowercase letters and handles suffix and invalid ranges", () => {
    expect(new Set(Array.from({ length: 1000 }, randomId)).size).toBe(1000);
    expect(parseRange("bytes=-3", 10)).toEqual({ offset: 7, length: 3 });
    expect(parseRange("bytes=4-", 10)).toEqual({ offset: 4, length: 6 });
    expect(parseRange("bytes=0-99", 10)).toEqual({ offset: 0, length: 10 });
    for (const value of ["bytes=-0", "bytes=10-", "bytes=4-2", "bytes=0-1,3-4", "bytes=-", "bytes=99999999999999999999-"]) expect(parseRange(value, 10)).toBeNull();
  });
});
