import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { LibraryResult, ParentFolder, Song, SongVersion } from "../src/lib/types.js";

const VERSION_PATTERN = /v(\d+)\.(\d+)/i;
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav"]);

export const mediaRegistry = new Map<string, string>();
export const folderRegistry = new Map<string, string>();

function stableId(value: string): string {
  return createHash("sha256").update(value).digest("base64url").slice(0, 24);
}

async function assertDirectory(directory: string): Promise<string> {
  const resolved = await fs.realpath(path.resolve(directory));
  const stat = await fs.stat(resolved);
  if (!stat.isDirectory()) throw new Error("That path is not a directory.");
  return resolved;
}

export async function listParentFolders(directory: string): Promise<{ directory: string; folders: ParentFolder[] }> {
  const root = await assertDirectory(directory);
  const entries = await fs.readdir(root, { withFileTypes: true });
  const folders = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map(({ name }) => ({ name }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
  return { directory: root, folders };
}

async function findAudioFiles(directory: string): Promise<string[]> {
  const found: string[] = [];
  const pending = [directory];

  while (pending.length > 0) {
    const current = pending.pop()!;
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(fullPath);
      else if (entry.isFile() && AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) && VERSION_PATTERN.test(entry.name)) {
        found.push(fullPath);
      }
    }
  }

  return found;
}

function preferMp3(files: string[]): string[] {
  const selected = new Map<string, string>();
  for (const file of files) {
    const extension = path.extname(file).toLowerCase();
    const stem = file.slice(0, -extension.length).toLocaleLowerCase();
    const existing = selected.get(stem);
    if (!existing || extension === ".mp3") selected.set(stem, file);
  }
  return [...selected.values()];
}

async function toVersion(file: string): Promise<SongVersion | null> {
  const filename = path.basename(file);
  const match = filename.match(VERSION_PATTERN);
  if (!match) return null;
  const stat = await fs.stat(file);
  const id = stableId(file);
  mediaRegistry.set(id, file);
  return {
    id,
    filename,
    version: `v${match[1]}.${match[2]}`,
    major: Number(match[1]),
    minor: Number(match[2]),
    modifiedAt: stat.mtimeMs,
    format: path.extname(file).slice(1).toLowerCase() as "mp3" | "wav",
  };
}

function newestFirst(a: SongVersion, b: SongVersion): number {
  return (
    b.major - a.major ||
    b.minor - a.minor ||
    b.modifiedAt - a.modifiedAt ||
    b.filename.localeCompare(a.filename, undefined, { numeric: true, sensitivity: "base" })
  );
}

export async function scanLibrary(directory: string, includedFolders: string[]): Promise<LibraryResult> {
  const root = await assertDirectory(directory);
  const available = await fs.readdir(root, { withFileTypes: true });
  const allowed = new Set(available.filter((entry) => entry.isDirectory()).map((entry) => entry.name));
  const selected = [...new Set(includedFolders)].filter((name) => allowed.has(name));
  const songs: Song[] = [];
  let scannedProjectCount = 0;

  for (const parentName of selected) {
    const parentPath = path.join(root, parentName);
    const projectEntries = await fs.readdir(parentPath, { withFileTypes: true });
    const projects = projectEntries.filter((entry) => entry.isDirectory() && !entry.name.startsWith("."));

    for (const project of projects) {
      scannedProjectCount += 1;
      const projectPath = path.join(parentPath, project.name);
      const files = preferMp3(await findAudioFiles(projectPath));
      const versions = (await Promise.all(files.map(toVersion))).filter((value): value is SongVersion => value !== null).sort(newestFirst);
      if (versions.length === 0) continue;

      const folderId = stableId(projectPath);
      folderRegistry.set(folderId, projectPath);
      const song: Song = {
        id: stableId(`${parentName}\0${projectPath}`),
        name: project.name.replace(/ Project$/i, ""),
        parentFolder: parentName,
        folderId,
        latest: versions[0],
        versions,
      };
      songs.push(song);
    }
  }

  songs.sort(
    (a, b) =>
      b.latest.modifiedAt - a.latest.modifiedAt ||
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
  );
  return { directory: root, songs, scannedProjectCount };
}
