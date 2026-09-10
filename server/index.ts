import { execFile } from "node:child_process";
import { createReadStream, promises as fs } from "node:fs";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { folderRegistry, listParentFolders, mediaRegistry, scanLibrary } from "./library.js";

import { shareSong } from "./sharing.js";

const runFile = promisify(execFile);
const app = express();
const port = Number(process.env.PORT ?? 53038);
const isProduction = process.env.NODE_ENV === "production";
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

app.use(express.json({ limit: "32kb" }));

app.get("/api/health", (_request, response) => response.json({ ok: true }));

// Sharing sends data off-device: require an explicit same-origin JSON request.
app.post("/api/share", async (request, response, next) => {
  const origin = request.headers.origin;
  if ((origin && origin !== `${request.protocol}://${request.headers.host}`)
      || (request.headers["sec-fetch-site"] && request.headers["sec-fetch-site"] !== "same-origin")
      || !request.is("application/json")
      || !["localhost", "127.0.0.1", "[::1]"].includes(request.hostname)) {
    response.status(403).json({ error: "Sharing must be started from Music Browser." });
    return;
  }
  try {
    response.json(await shareSong(String(request.body?.id ?? "")));
  } catch (error) { next(error); }
});

app.post("/api/pick-directory", async (_request, response, next) => {
  try {
    if (process.platform !== "darwin") {
      response.status(501).json({ error: "The native folder picker is currently available on macOS only." });
      return;
    }
    const script = 'POSIX path of (choose folder with prompt "Choose the folder that contains your music folders")';
    const { stdout } = await runFile("osascript", ["-e", script]);
    response.json({ directory: stdout.trim().replace(/\/$/, "") });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 1) {
      response.status(409).json({ error: "Folder selection was cancelled." });
      return;
    }
    next(error);
  }
});

app.get("/api/folders", async (request, response, next) => {
  try {
    const directory = String(request.query.directory ?? "").trim();
    if (!directory) throw new Error("Enter a directory first.");
    response.json(await listParentFolders(directory));
  } catch (error) {
    next(error);
  }
});

app.post("/api/scan", async (request, response, next) => {
  try {
    const directory = String(request.body?.directory ?? "").trim();
    const includedFolders = Array.isArray(request.body?.includedFolders)
      ? request.body.includedFolders.filter((value: unknown): value is string => typeof value === "string")
      : [];
    if (!directory) throw new Error("Enter a directory first.");
    response.json(await scanLibrary(directory, includedFolders));
  } catch (error) {
    next(error);
  }
});

app.get("/api/audio/:id", async (request, response, next) => {
  try {
    const file = mediaRegistry.get(request.params.id);
    if (!file) {
      response.status(404).json({ error: "That track is no longer in the scanned library." });
      return;
    }
    const stat = await fs.stat(file);
    const range = request.headers.range;
    const contentType = path.extname(file).toLowerCase() === ".mp3" ? "audio/mpeg" : "audio/wav";
    response.setHeader("Accept-Ranges", "bytes");
    response.setHeader("Content-Type", contentType);
    response.setHeader("Cache-Control", "private, max-age=3600");

    if (!range) {
      response.setHeader("Content-Length", stat.size);
      createReadStream(file).pipe(response);
      return;
    }

    const match = range.match(/bytes=(\d*)-(\d*)/);
    if (!match) {
      response.status(416).end();
      return;
    }
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
    if (start > end || start >= stat.size) {
      response.status(416).setHeader("Content-Range", `bytes */${stat.size}`).end();
      return;
    }
    response.status(206);
    response.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
    response.setHeader("Content-Length", end - start + 1);
    createReadStream(file, { start, end }).pipe(response);
  } catch (error) {
    next(error);
  }
});

app.post("/api/reveal", async (request, response, next) => {
  try {
    if (process.platform !== "darwin") {
      response.status(501).json({ error: "Reveal in Finder is available on macOS only." });
      return;
    }
    const kind = request.body?.kind === "folder" ? "folder" : "file";
    const id = String(request.body?.id ?? "");
    const target = kind === "folder" ? folderRegistry.get(id) : mediaRegistry.get(id);
    if (!target) {
      response.status(404).json({ error: "That item is no longer in the scanned library." });
      return;
    }
    await runFile("open", kind === "folder" ? [target] : ["-R", target]);
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

if (isProduction) {
  app.use(express.static(path.join(projectRoot, "dist")));
  app.get(/.*/, (_request, response) => response.sendFile(path.join(projectRoot, "dist", "index.html")));
} else {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({ root: projectRoot, server: { middlewareMode: true }, appType: "spa" });
  app.use(vite.middlewares);
}

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  console.error(error);
  response.status(400).json({ error: message });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Music Browser is ready at http://localhost:${port}`);
});
