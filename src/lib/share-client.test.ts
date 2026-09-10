import { afterEach, expect, it, vi } from "vitest";
import { uploadTrack } from "./share-client";
afterEach(() => vi.unstubAllGlobals());
function mockStream(text: string) {
  const bytes = new TextEncoder().encode(text);
  vi.stubGlobal("fetch", async () => new Response(new ReadableStream({ start(controller) {
    // Split JSON and Unicode across arbitrary network chunks.
    for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3));
    controller.close();
  } })));
}
it("reads progress and a final link from chunked NDJSON", async () => {
  mockStream('{"type":"progress","phase":"uploading","bytes":25,"total":100}\n{"type":"complete","id":"abcdefgh","url":"https://music.example/abcdefgh"}\n');
  const progress = vi.fn();
  expect((await uploadTrack("track", progress)).id).toBe("abcdefgh");
  expect(progress).toHaveBeenCalledWith(expect.objectContaining({ bytes: 25 }));
});
it("reports server errors and interrupted uploads instead of showing false success", async () => {
  mockStream('{"type":"error","error":"Could not upload café"}\n');
  await expect(uploadTrack("track", () => {})).rejects.toThrow("Could not upload café");
  mockStream('{"type":"progress","bytes":25}\n');
  await expect(uploadTrack("track", () => {})).rejects.toThrow("before the share was confirmed");
});
