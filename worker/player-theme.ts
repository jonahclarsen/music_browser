import savedTheme from "./player-theme.json";

export const defaultTheme = savedTheme;
export type PlayerTheme = typeof savedTheme;
export const colorControls = {
  background: "Page background", card: "Card background", footer: "Player background",
  text: "Primary text", muted: "Secondary text", time: "Timestamps", accent: "Accent / played waveform",
  accentSoft: "Selected version background", border: "Player divider", cardBorder: "Card border",
  wave: "Unplayed waveform", wavePreview: "Waveform hover", play: "Play button",
  playIcon: "Play icon", error: "Error text",
};
export const layoutControls = {
  cardWidth: ["Card width", 320, 1000, 1], cardHeight: ["Minimum card height", 280, 800, 1],
  radius: ["Corner radius", 0, 60, 1], pagePadding: ["Page padding", 8, 64, 1],
  songPadding: ["Song padding", 16, 80, 1], footerPadding: ["Player padding", 12, 48, 1],
  playSize: ["Play button size", 32, 72, 1], waveHeight: ["Waveform height", 20, 100, 1],
  timelineGap: ["Timeline spacing", 4, 24, 1], controlGap: ["Space above waveform", 4, 40, 1],
  borderWidth: ["Border thickness", 0, 4, 1], shadow: ["Shadow opacity (%)", 0, 60, 1],
  titleSize: ["Title size", 20, 64, 1], titleWeight: ["Title weight", 300, 800, 100],
  bodySize: ["Version text size", 10, 20, 1], timeSize: ["Timestamp size", 9, 16, 1],
  eyebrowSize: ["Intro size", 9, 18, 1], eyebrowSpacing: ["Intro letter spacing (em)", 0, 0.4, 0.01],
  versionSpacing: ["Space above version list", 8, 60, 1],
} as const;
export const fontOptions = {
  avenir: '"Avenir Next",Avenir,system-ui,sans-serif',
  system: 'system-ui,sans-serif',
  helvetica: '"Helvetica Neue",Helvetica,Arial,sans-serif',
  georgia: 'Georgia,serif',
  mono: '"Roboto Mono",monospace',
};

export function validateTheme(value: unknown): PlayerTheme {
  if (!value || typeof value !== "object") throw new Error("Choose a valid theme JSON file.");
  const theme = value as PlayerTheme;
  for (const mode of ["light", "dark"] as const) {
    for (const key of Object.keys(colorControls) as (keyof typeof colorControls)[]) {
      if (typeof theme[mode]?.[key] !== "string" || !/^#[0-9a-f]{6}$/i.test(theme[mode][key])) throw new Error(`Invalid ${mode} color: ${key}`);
    }
  }
  for (const [key, [, min, max]] of Object.entries(layoutControls)) {
    const n = theme.layout?.[key as keyof PlayerTheme["layout"]];
    if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max) throw new Error(`Invalid size: ${key}`);
  }
  for (const key of ["font", "timeFont"] as const) {
    if (!Object.hasOwn(fontOptions, theme[key])) throw new Error("Invalid font choice.");
  }
  if (typeof theme.eyebrow !== "string" || theme.eyebrow.length > 100) throw new Error("Keep the intro text under 100 characters.");
  for (const key of ["showEyebrow", "showVersion", "showDates", "showVolume"] as const) {
    if (typeof theme[key] !== "boolean") throw new Error(`Invalid option: ${key}`);
  }
  return theme;
}

// Iridescent surfaces inspired by Trilly's pink/violet/aqua/gold palette and Balance's layered backgrounds.
function iridescence(mode: "light" | "dark"): string {
  return mode === "light" ? `
--pageGradient:radial-gradient(circle at 12% 18%,rgb(242 76 159 / .13),transparent 34%),radial-gradient(circle at 88% 16%,rgb(57 197 214 / .14),transparent 32%),radial-gradient(circle at 76% 88%,rgb(240 162 62 / .13),transparent 36%),linear-gradient(145deg,#f8f3fb,#f2f8fa 52%,#faf6ef);
--rimGradient:linear-gradient(135deg,#e6a7cf,#c7b1e9 32%,#a4d9da 65%,#ecd0a4);
--footerGradient:linear-gradient(112deg,#f8edf6,#efedf9 34%,#eaf7f5 68%,#fcf3e5);
--playGradient:linear-gradient(135deg,#a13c91,#7256b7 48%,#2f7f8a);
--shadowRGB:74 42 100` : `
--pageGradient:radial-gradient(circle at 12% 18%,rgb(240 71 164 / .15),transparent 34%),radial-gradient(circle at 88% 16%,rgb(51 198 218 / .14),transparent 32%),radial-gradient(circle at 76% 88%,rgb(246 170 66 / .11),transparent 36%),linear-gradient(145deg,#15101b,#10191e 52%,#1c1710);
--rimGradient:linear-gradient(135deg,#805374,#66557f 32%,#426f74 65%,#806747);
--footerGradient:linear-gradient(112deg,#2a1e2a,#242237 34%,#1b3032 68%,#322a20);
--playGradient:linear-gradient(135deg,#ef77bc,#aa8bea 48%,#58c3c5);
--shadowRGB:0 0 0`;
}

export function themeCSS(theme: PlayerTheme = defaultTheme): string {
  validateTheme(theme);
  const palette = (mode: "light" | "dark") => Object.keys(colorControls).map(key => `--${key}:${theme[mode][key as keyof typeof colorControls]}`).join(";") + ";" + iridescence(mode);
  const sizes = Object.keys(layoutControls).map(key => `--${key}:${theme.layout[key as keyof PlayerTheme["layout"]]}${["titleWeight", "eyebrowSpacing", "shadow"].includes(key) ? "" : "px"}`).join(";");
  return `:root{color-scheme:light dark;${palette("light")};${sizes};--font:${fontOptions[theme.font as keyof typeof fontOptions]};--timeFont:${fontOptions[theme.timeFont as keyof typeof fontOptions]};--line-strong:var(--wave);--wave-preview:var(--wavePreview)}
@media(prefers-color-scheme:dark){:root:not([data-theme="light"]){${palette("dark")}}}
:root[data-theme="dark"]{color-scheme:dark;${palette("dark")}}:root[data-theme="light"]{color-scheme:light}
.eyebrow{display:${theme.showEyebrow ? "block" : "none"}}.version{display:${theme.showVersion ? "block" : "none"}}.latest-date,nav .date{display:${theme.showDates ? "block" : "none"}}.volume{visibility:${theme.showVolume ? "visible" : "hidden"}}`;
}
