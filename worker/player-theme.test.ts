import { describe, expect, it } from "vitest";
import { defaultTheme, themeCSS, validateTheme } from "./player-theme";
import { playerPage } from "./player-page";

describe("shared player themes", () => {
  it("round trips exported themes and emits system and preview palettes", () => {
    const theme = validateTheme(JSON.parse(JSON.stringify(defaultTheme)));
    const css = themeCSS(theme);
    expect(css).toContain("@media(prefers-color-scheme:dark)");
    expect(css).toContain('--background:#0d0d0e');
    expect(css).toContain(':root[data-theme="light"]');
    expect(css).toContain(':root[data-theme="dark"]');
  });
  it("rejects malformed imports and CSS injection", () => {
    expect(() => validateTheme(null)).toThrow();
    for (const change of [
      { light: { ...defaultTheme.light, background: "red;}body{display:none}" } },
      { layout: { ...defaultTheme.layout, waveHeight: -1 } },
      { layout: { ...defaultTheme.layout, titleSize: Infinity } },
      { font: "__proto__" }, { showVolume: "false" }, { eyebrow: "x".repeat(101) },
    ]) expect(() => validateTheme({ ...defaultTheme, ...change })).toThrow();
  });
  it("escapes custom copy and honors hidden controls in rendered pages", () => {
    const theme = { ...defaultTheme, eyebrow: '<img src=x onerror="alert(1)">', showDates: false, showVolume: false };
    const page = playerPage({ title: "Song", latest: 0, versions: [{ label: "Song.wav", size: 10, contentType: "audio/wav" }] }, "abcdefgh", 0, theme);
    expect(page).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    expect(page).toContain('.latest-date,nav .date{display:none}');
    expect(page).toContain('.volume{visibility:hidden}');
  });
});
