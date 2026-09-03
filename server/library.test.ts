import { mkdtemp, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listParentFolders, scanLibrary } from "./library.js";

const temporaryDirectories: string[] = [];

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "music-browser-"));
  temporaryDirectories.push(root);
  await mkdir(path.join(root, "Archive"));
  await mkdir(path.join(root, "Current", "Glass Houses Project", "Exports"), { recursive: true });
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("library scanner", () => {
  it("lists only immediate parent folders", async () => {
    const root = await fixture();
    await writeFile(path.join(root, "notes.txt"), "ignore me");
    expect((await listParentFolders(root)).folders.map(({ name }) => name)).toEqual(["Archive", "Current"]);
  });

  it("orders semantic versions, breaks equal-version ties by mtime, and prefers mp3", async () => {
    const root = await fixture();
    const exportsDirectory = path.join(root, "Current", "Glass Houses Project", "Exports");
    const oldV2 = path.join(exportsDirectory, "Glass Houses mix v2.1.wav");
    const newV2 = path.join(exportsDirectory, "Glass Houses alt v2.1.mp3");
    await writeFile(path.join(exportsDirectory, "Glass Houses v1.9.mp3"), "audio");
    await writeFile(oldV2, "audio");
    await writeFile(newV2, "audio");
    await writeFile(path.join(exportsDirectory, "Glass Houses alt v2.1.wav"), "duplicate");
    await utimes(oldV2, new Date(1_000), new Date(1_000));
    await utimes(newV2, new Date(2_000), new Date(2_000));

    const result = await scanLibrary(root, ["Current", "does-not-exist"]);
    expect(result.songs).toHaveLength(1);
    expect(result.songs[0].name).toBe("Glass Houses");
    expect(result.songs[0].versions.map(({ filename }) => filename)).toEqual([
      "Glass Houses alt v2.1.mp3",
      "Glass Houses mix v2.1.wav",
      "Glass Houses v1.9.mp3",
    ]);
  });
});
