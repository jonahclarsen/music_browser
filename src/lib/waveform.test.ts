import { describe, expect, it } from "vitest";
import { audioPeaks } from "../../public/waveform.js";

const buffer = (...channels: number[][]) => ({
  numberOfChannels: channels.length,
  getChannelData: (channel: number) => Float32Array.from(channels[channel]),
}) as AudioBuffer;

describe("waveform peaks", () => {
  it("preserves transients, opposite-phase stereo and the final sample", () => {
    expect(audioPeaks(buffer([0, 0.5, 0, 0, 0, 0], [0, -0.5, 0, 0, 0, -1]), 3)).toEqual([0.5, 0, 1]);
  });
  it("handles silence and tracks shorter than the bin count", () => {
    expect(audioPeaks(buffer([0]), 3)).toEqual([0, 0, 0]);
    expect(audioPeaks(buffer([1]), 3)).toEqual([0, 0, 1]);
  });
});
