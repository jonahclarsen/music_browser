import { Router } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { playerPage, playerScript } from "../worker/player-page.js";
import { colorControls, defaultTheme, fontOptions, layoutControls, themeCSS, validateTheme } from "../worker/player-theme.js";

export function uiEditorRouter(): Router {
  const router = Router();
  const assets = path.join(path.dirname(fileURLToPath(import.meta.url)), "ui-editor");
  router.use((request, response, next) => {
    if (!["localhost", "127.0.0.1", "[::1]"].includes(request.hostname)
      || (request.headers.origin && request.headers.origin !== `${request.protocol}://${request.headers.host}`)) {
      response.status(403).send("Open the editor from the local Music Browser.");
      return;
    }
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Frame-Options", "SAMEORIGIN");
    next();
  });
  router.get("/", (_request, response) => response.sendFile(path.join(assets, "index.html")));
  router.get("/editor.js", (_request, response) => response.sendFile(path.join(assets, "editor.js")));
  router.get("/config", (_request, response) => response.json({ theme: defaultTheme, colorControls, layoutControls, fonts: Object.keys(fontOptions) }));
  router.post("/theme", (request, response, next) => {
    if (!request.is("application/json") || request.headers["sec-fetch-site"] === "cross-site") {
      response.status(403).json({ error: "Edit themes from Music Browser." });
      return;
    }
    try { const theme = validateTheme(request.body); response.json({ css: themeCSS(theme), theme }); }
    catch (error) { next(error); }
  });
  router.get("/player.js", (_request, response) => response.type("js").send(playerScript));
  router.get("/preview", (_request, response) => {
    const versions = [1, 2, 3].map(n => ({ label: `After the rain v${n}.0.wav`, size: 1, contentType: "audio/wav" as const, modifiedAt: Date.UTC(2026, 8, n) }));
    response.type("html").send(playerPage({ title: "After the rain", latest: 2, versions }, "abcdefgh", 2)
      .replace('src="/player.js"', 'src="/ui-editor/player.js"').replace('src="/abcdefgh/audio/2"', 'src="/ui-editor/demo.wav"'));
  });
  router.get("/demo.wav", (request, response) => {
    // A quiet, generated demo with changing amplitude; users can preview their own local file.
    const samples = 8000 * 16;
    const wav = Buffer.alloc(44 + samples * 2);
    wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(samples * 2, 40);
    for (let i = 0; i < samples; i++) {
      const envelope = Math.min(1, i / 800, (samples - i) / 800) * (0.2 + 0.8 * Math.abs(Math.sin(i / 12000)));
      wav.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 220 / 8000) * envelope * 9000), 44 + i * 2);
    }
    response.setHeader("Accept-Ranges", "bytes");
    response.type("audio/wav");
    const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range || "");
    if (range) {
      const start = Number(range[1]); const end = Math.min(Number(range[2] || wav.length - 1), wav.length - 1);
      if (start > end) { response.status(416).setHeader("Content-Range", `bytes */${wav.length}`); response.end(); return; }
      response.status(206).setHeader("Content-Range", `bytes ${start}-${end}/${wav.length}`);
      response.send(wav.subarray(start, end + 1));
    } else response.send(wav);
  });
  return router;
}
