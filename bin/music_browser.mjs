#!/usr/bin/env node

import { execFile } from "node:child_process";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.PORT ?? "53038";
const address = `http://localhost:${port}`;
const child = spawn("pnpm", ["dev"], {
  cwd: projectRoot,
  env: { ...process.env, PORT: port },
  stdio: "inherit",
});

let opened = false;
for (let attempt = 0; attempt < 80 && child.exitCode === null; attempt += 1) {
  try {
    const response = await fetch(`${address}/api/health`);
    if (response.ok) {
      opened = true;
      execFile(process.platform === "darwin" ? "open" : "xdg-open", [address], () => {});
      break;
    }
  } catch {
    // The development server is still starting.
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}

if (!opened && child.exitCode === null) {
  console.error(`Music Browser started, but ${address} did not respond. Open it manually once the server is ready.`);
}

child.on("exit", (code, signal) => {
  if (signal) console.log(`Music Browser stopped (${signal}).`);
  process.exitCode = code ?? 0;
});
