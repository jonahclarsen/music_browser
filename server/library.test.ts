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

  it("orders songs by their latest export modification time", async () => {
    const root = await fixture();
    const current = path.join(root, "Current");
    const glassExport = path.join(current, "Glass Houses Project", "Exports", "Glass Houses v1.0.mp3");
    const signalExport = path.join(current, "Signal Bloom Project", "Signal Bloom v1.0.mp3");
    await mkdir(path.dirname(signalExport), { recursive: true });
    await writeFile(glassExport, "audio");
    await writeFile(signalExport, "audio");
    await utimes(glassExport, new Date(1_000), new Date(1_000));
    await utimes(signalExport, new Date(2_000), new Date(2_000));

    const result = await scanLibrary(root, ["Current"]);
    expect(result.songs.map(({ name }) => name)).toEqual(["Signal Bloom", "Glass Houses"]);
  });

  it("uses the oldest root Ableton file as the song date, falling back to the oldest audio version", async () => {
    const root = await fixture();
    const project = path.join(root, "Current", "Glass Houses Project");
    const exportsDirectory = path.join(project, "Exports");
    const audioOne = path.join(exportsDirectory, "Glass Houses v1.0.mp3");
    const audioTwo = path.join(exportsDirectory, "Glass Houses v2.0.mp3");
    const alsOne = path.join(project, "Glass Houses.als");
    const alsTwo = path.join(project, "Glass Houses backup.als");
    await writeFile(audioOne, "audio");
    await writeFile(audioTwo, "audio");
    await writeFile(alsOne, "ableton");
    await writeFile(alsTwo, "ableton");
    await utimes(audioOne, new Date(3_000), new Date(3_000));
    await utimes(audioTwo, new Date(4_000), new Date(4_000));
    await utimes(alsOne, new Date(2_000), new Date(2_000));
    await utimes(alsTwo, new Date(1_000), new Date(1_000));

    const result = await scanLibrary(root, ["Current"]);
    expect(result.songs[0].date).toBe(1_000);
  });

  it("reuses a recent scan while the root folder set and selection are unchanged", async () => {
    const root = await fixture();
    const firstAudio = path.join(root, "Current", "Glass Houses Project", "Exports", "Glass Houses v1.0.mp3");
    await writeFile(firstAudio, "audio");
    const first = await scanLibrary(root, ["Current"]);

    const newProject = path.join(root, "Current", "Not Yet Rescanned Project");
    await mkdir(newProject);
    await writeFile(path.join(newProject, "Not Yet Rescanned v1.0.mp3"), "audio");
    const second = await scanLibrary(root, ["Current"]);

    expect(second).toBe(first);
    expect(second.songs.map(({ name }) => name)).toEqual(["Glass Houses"]);
  });
});
