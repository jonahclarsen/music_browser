import { writable } from "svelte/store";

export type ThemeId = "studio" | "paper" | "neon" | "phosphor" | "frost";

export interface ThemeOption {
  id: ThemeId;
  name: string;
  tagline: string;
}

export const THEME_KEY = "music-browser-theme";
export const DEFAULT_THEME: ThemeId = "studio";

export const THEMES: readonly ThemeOption[] = [
  { id: "studio", name: "Studio", tagline: "Acid lime on charcoal" },
  { id: "paper", name: "Paper", tagline: "Warm cream, editorial serif" },
  { id: "neon", name: "Neon", tagline: "Magenta glow on midnight" },
  { id: "phosphor", name: "Phosphor", tagline: "Green terminal, all mono" },
  { id: "frost", name: "Frost", tagline: "Cool slate, soft blue" },
];

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some(({ id }) => id === value);
}

export function readSavedTheme(): ThemeId {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return isThemeId(saved) ? saved : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export const theme = writable<ThemeId>(DEFAULT_THEME);

export function applyTheme(id: ThemeId): void {
  document.documentElement.dataset.theme = id;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) return;
  const background = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  if (background) meta.content = background;
}

export function setTheme(id: ThemeId): void {
  theme.set(id);
  try {
    localStorage.setItem(THEME_KEY, id);
  } catch {
    // The theme still applies for this session when storage is unavailable.
  }
}
