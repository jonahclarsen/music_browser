export type FontRole = "sans" | "display" | "mono";

export interface FontOption {
  name: string;
  value: string;
}

export type FontSelections = Record<FontRole, string>;

export const FONT_KEY = "music-browser-fonts-v1";

export const FONT_OPTIONS: Record<FontRole, readonly FontOption[]> = {
  sans: [
    { name: "DM Sans", value: '"DM Sans Variable", sans-serif' },
    { name: "System UI", value: "system-ui, sans-serif" },
    { name: "Avenir Next", value: '"Avenir Next", Avenir, sans-serif' },
    { name: "Helvetica Neue", value: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
    { name: "Futura", value: "Futura, sans-serif" },
    { name: "Gill Sans", value: '"Gill Sans", sans-serif' },
    { name: "Trebuchet", value: '"Trebuchet MS", sans-serif' },
    { name: "Verdana", value: "Verdana, sans-serif" },
    { name: "Arial", value: "Arial, sans-serif" },
    { name: "Optima", value: "Optima, sans-serif" },
  ],
  display: [
    { name: "DM Sans", value: '"DM Sans Variable", sans-serif' },
    { name: "Avenir Next", value: '"Avenir Next", Avenir, sans-serif' },
    { name: "Futura", value: "Futura, sans-serif" },
    { name: "Gill Sans", value: '"Gill Sans", sans-serif' },
    { name: "Helvetica Neue", value: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
    { name: "Georgia", value: "Georgia, serif" },
    { name: "Baskerville", value: "Baskerville, serif" },
    { name: "Palatino", value: 'Palatino, "Palatino Linotype", serif' },
    { name: "Didot", value: "Didot, serif" },
    { name: "Copperplate", value: "Copperplate, serif" },
  ],
  mono: [
    { name: "JetBrains Mono", value: '"JetBrains Mono", monospace' },
    { name: "SF Mono", value: 'ui-monospace, "SFMono-Regular", monospace' },
    { name: "Menlo", value: "Menlo, monospace" },
    { name: "Monaco", value: "Monaco, monospace" },
    { name: "Consolas", value: "Consolas, monospace" },
    { name: "Andale Mono", value: '"Andale Mono", monospace' },
    { name: "Courier New", value: '"Courier New", monospace' },
    { name: "Lucida Console", value: '"Lucida Console", monospace' },
    { name: "Roboto Mono", value: '"Roboto Mono", monospace' },
    { name: "IBM Plex Mono", value: '"IBM Plex Mono", monospace' },
  ],
};

export const DEFAULT_FONTS: FontSelections = {
  sans: FONT_OPTIONS.sans[0].value,
  display: FONT_OPTIONS.display[0].value,
  mono: FONT_OPTIONS.mono[0].value,
};

function isAllowed(role: FontRole, value: unknown): value is string {
  return typeof value === "string" && FONT_OPTIONS[role].some((option) => option.value === value);
}

export function readFonts(): FontSelections {
  try {
    const saved = JSON.parse(localStorage.getItem(FONT_KEY) ?? "{}") as Partial<FontSelections>;
    return {
      sans: isAllowed("sans", saved.sans) ? saved.sans : DEFAULT_FONTS.sans,
      display: isAllowed("display", saved.display) ? saved.display : DEFAULT_FONTS.display,
      mono: isAllowed("mono", saved.mono) ? saved.mono : DEFAULT_FONTS.mono,
    };
  } catch {
    return { ...DEFAULT_FONTS };
  }
}

export function applyFonts(fonts: FontSelections): void {
  document.documentElement.style.setProperty("--font-sans", fonts.sans);
  document.documentElement.style.setProperty("--font-display", fonts.display);
  document.documentElement.style.setProperty("--font-mono", fonts.mono);
}

export function saveFonts(fonts: FontSelections): void {
  applyFonts(fonts);
  try {
    localStorage.setItem(FONT_KEY, JSON.stringify(fonts));
  } catch {
    // Font choices still apply for this session when storage is unavailable.
  }
}
