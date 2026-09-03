import { get } from "svelte/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { player, restorePlayer, selectQueueIndex, setPosition, startPreview, stopPreview, preview } from "./player.js";
import type { PlayerTrack } from "./types.js";

const track = (id: string): PlayerTrack => ({
  id,
  filename: `${id} v1.0.mp3`,
  version: "v1.0",
  major: 1,
  minor: 0,
  modifiedAt: 1,
  format: "mp3",
  songName: id,
  parentFolder: "Current",
  folderId: `${id}-folder`,
  songDate: 1,
});

afterEach(() => {
  vi.useRealTimers();
  stopPreview();
});

describe("player switching", () => {
  it("returns to a recently left track at its previous position", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const first = track("first");
    const second = track("second");
    restorePlayer([first, second], 0, true, false, 42);
    setPosition(42);

    selectQueueIndex(1);
    vi.advanceTimersByTime(9_000);
    selectQueueIndex(0);

    expect(get(player).position).toBe(42);
  });

  it("starts over after the ten-second return window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const first = track("expired-first");
    const second = track("expired-second");
    restorePlayer([first, second], 0, true, false, 24);
    setPosition(24);

    selectQueueIndex(1);
    vi.advanceTimersByTime(10_001);
    selectQueueIndex(0);

    expect(get(player).position).toBe(0);
  });

  it("keeps preview state separate from the main player", () => {
    const main = track("main");
    const sample = track("sample");
    restorePlayer([main], 0, true, false, 18);

    startPreview(sample);
    expect(get(preview)).toEqual(sample);
    expect(get(player).current).toEqual(main);
    expect(get(player).position).toBe(18);
    stopPreview();
    expect(get(preview)).toBeNull();
  });
});
