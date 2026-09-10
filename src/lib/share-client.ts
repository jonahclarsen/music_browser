import type { ShareProgress, ShareResult } from "./sharing";

export async function uploadTrack(id: string, onprogress: (progress: ShareProgress) => void): Promise<ShareResult> {
  const response = await fetch("/api/share", {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
    body: JSON.stringify({ id }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? "Could not share this song.");
  }
  if (!response.body) throw new Error("Upload progress is unavailable. Try again.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: ShareResult | undefined;
  function consume(line: string) {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === "error") throw new Error(event.error);
    if (event.type === "progress") onprogress(event);
    if (event.type === "complete") result = event;
  }
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop()!;
      lines.forEach(consume);
      if (done) { consume(buffer); break; }
    }
  } finally { reader.releaseLock(); }
  if (!result?.url) throw new Error("The connection ended before the share was confirmed. Try sharing again to recover an existing link.");
  return result;
}
