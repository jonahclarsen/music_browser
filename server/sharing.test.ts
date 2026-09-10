import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { shareSong } from "./sharing";
import { mediaRegistry, songRegistry } from "./library";
import type { Song, SongVersion } from "../src/lib/types";
import type { ShareProgress } from "../src/lib/sharing";

let directory: string | undefined;
afterEach(async () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); if (directory) await fs.rm(directory, { recursive: true, force: true }); directory = undefined; });
async function setup() {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "sharing-unit-"));
  const versions: SongVersion[] = [1, 2].map(n => ({ id: `sharing-test-${n}`, filename: `Test v${n}.0.wav`, version: `v${n}.0`, major: n, minor: 0, modifiedAt: 0, format: "wav" }));
  const song: Song = { id: "test-song", name: "Test", parentFolder: "Test", folderId: "test-folder", date: 0, latest: versions[1], versions };
  for (const version of versions) {
    const file = path.join(directory, version.filename);
    await fs.writeFile(file, new Uint8Array(200_000));
    mediaRegistry.set(version.id, file); songRegistry.set(version.id, song);
  }
  vi.stubEnv("MUSIC_BROWSER_SHARE_URL", "https://music.example");
  vi.stubEnv("MUSIC_BROWSER_SHARE_TOKEN", "test-token");
  return song;
}
describe("local sharing", () => {
  it("streams byte progress, coalesces simultaneous requests, and reuses filenames without reading changed audio", async () => {
    const song = await setup();
    let published = false;
    let uploaded = 0;
    const request = vi.fn(async (url: URL, options: RequestInit) => {
      expect((options.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
      if (url.pathname === "/api/shares/find") return Response.json(published ? { id: "abcdefgh", url: "https://music.example/abcdefgh", reused: true } : {});
      if (url.pathname === "/api/shares") return Response.json({ id: "abcdefgh" });
      if (options.method === "PUT") {
        for await (const chunk of options.body as unknown as AsyncIterable<Uint8Array>) uploaded += chunk.byteLength;
        return Response.json({ ok: true });
      }
      if (url.pathname.endsWith("publish")) { published = true; return Response.json({ id: "abcdefgh", url: "https://music.example/abcdefgh" }); }
      throw new Error(`Unexpected request ${url.pathname}`);
    });
    vi.stubGlobal("fetch", request);
    const progress: ShareProgress[] = [];
    const first = shareSong(song.versions[0].id, p => progress.push(p));
    const second = shareSong(song.versions[1].id);
    expect(first).toBe(second);
    expect((await first).url).toBe("https://music.example/abcdefgh");
    expect(uploaded).toBe(400_000);
    expect(progress[0].phase).toBe("checking");
    expect(progress.some(p => p.bytes > 0 && p.bytes < p.total)).toBe(true);
    expect(progress.at(-1)).toMatchObject({ phase: "publishing", bytes: 400_000, total: 400_000 });
    // Reuse is based only on the names: even unavailable local bytes need no re-upload.
    await fs.rm(directory!, { recursive: true, force: true });
    request.mockClear();
    expect((await shareSong(song.versions[0].id)).reused).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("cleans an incomplete draft without invoking published-share deletion", async () => {
    const song = await setup();
    const paths: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: URL, options: RequestInit) => {
      paths.push(`${options.method} ${url.pathname}`);
      if (url.pathname.endsWith("find")) return Response.json({});
      if (url.pathname === "/api/shares") return Response.json({ id: "abcdefgh" });
      if (options.method === "PUT") return Response.json({ error: "Upload failed" }, { status: 503 });
      return Response.json({ ok: true });
    }));
    await expect(shareSong(song.versions[0].id)).rejects.toThrow("Upload failed");
    expect(paths.at(-1)).toBe("DELETE /api/shares/abcdefgh");
    expect(paths.some(p => p.includes("revoke"))).toBe(false);
  });
});
