// The single source of look data for the site — the same six documents the
// app bundles (docs/website-master-prompt.md section 1). Every colour on the
// site comes from here or from derivation over it (lib/derive.ts); no
// duplicated colour values anywhere else.

export type Base = "light" | "dark";
export type Shape = "sharp" | "soft" | "round";
export type FontMode = "system" | "rounded" | "serif" | "mono";

export interface Look {
  /** Stable slug, also the key used to remember the choice. */
  id: string;
  name: string;
  base: Base;
  colors: { bg: string; surface: string; text: string; accent: string };
  shape: Shape;
  font: FontMode;
}

export const LOOKS: Look[] = [
  {
    id: "strawberry-milk",
    name: "Strawberry Milk",
    base: "light",
    colors: { bg: "#fff5f7", surface: "#ffffff", text: "#4a2c3a", accent: "#ff8fb1" },
    shape: "round",
    font: "rounded",
  },
  {
    id: "matcha",
    name: "Matcha",
    base: "light",
    colors: { bg: "#f3f7ee", surface: "#ffffff", text: "#2f3a2a", accent: "#8bc34a" },
    shape: "soft",
    font: "system",
  },
  {
    id: "lavender-haze",
    name: "Lavender Haze",
    base: "light",
    colors: { bg: "#f6f2ff", surface: "#ffffff", text: "#35295a", accent: "#b79cff" },
    shape: "round",
    font: "rounded",
  },
  {
    id: "midnight-grape",
    name: "Midnight Grape",
    base: "dark",
    colors: { bg: "#1a1423", surface: "#241b31", text: "#f1e9ff", accent: "#c58bff" },
    shape: "round",
    font: "rounded",
  },
  {
    id: "blueberry",
    name: "Blueberry",
    base: "dark",
    colors: { bg: "#121826", surface: "#1a2236", text: "#e6edff", accent: "#6ea8ff" },
    shape: "soft",
    font: "system",
  },
  {
    id: "ink",
    name: "Ink",
    base: "dark",
    colors: { bg: "#0f0f0f", surface: "#181818", text: "#f2f2f2", accent: "#ffffff" },
    shape: "sharp",
    font: "mono",
  },
];

// The array literal above is non-empty by construction; the fallback is the
// first entry, which is always the light default.
const FALLBACK_LOOK = LOOKS[0] as Look;

export function lookById(id: string): Look {
  return LOOKS.find((l) => l.id === id) ?? FALLBACK_LOOK;
}

/** Which look a first-time visitor starts on, per their colour scheme. */
export function defaultLookId(prefersDark: boolean): string {
  return prefersDark ? "blueberry" : "strawberry-milk";
}
