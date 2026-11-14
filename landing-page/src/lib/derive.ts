// Derives the site's extra tokens from a look, with the same rules the app's
// look/derive.rs uses, so the site themes exactly like the product.

import { type Look } from "./looks";
import { contrast, mix, parseHex, toHex, toRgba } from "./contrast";

/** Faint text only has to stay noticeable, not readable. */
const FAINT_CONTRAST_MIN = 4.5;
export const TEXT_CONTRAST_MIN = 4.5;
export const ACCENT_FILL_MIN = 1.3;

const BLACK = { r: 0, g: 0, b: 0 };
const WHITE = { r: 255, g: 255, b: 255 };

export interface DerivedTokens {
  /** Accent pulled toward the text until readable on bg, surface, and both
      tinted with 14% accent — for text and focus rings. */
  accentInk: string;
  /** Secondary text, as close to the background as AA allows. */
  muted: string;
  /** Tertiary text for hints. */
  faint: string;
  /** Accent at wash strength, for badges and selection tints. */
  accentSoft: string;
  /** Text on accent fills: first of text, bg, black, white with AA contrast. */
  onAccent: string;
  border: string;
  borderStrong: string;
  hover: string;
  active: string;
  /** Corner radii from the look's shape, sm/md/lg. */
  radius: [string, string, string];
}

const RADII: Record<Look["shape"], [string, string, string]> = {
  sharp: ["2px", "4px", "6px"],
  soft: ["5px", "8px", "14px"],
  round: ["8px", "14px", "22px"],
};

/** validate() has accepted this string, so it always parses. */
function parsed(s: string) {
  return parseHex(s) ?? BLACK;
}

export function deriveTokens(look: Look): DerivedTokens {
  const c = look.colors;
  const dark = look.base === "dark";
  const bg = parsed(c.bg);
  const surface = parsed(c.surface);
  const text = parsed(c.text);
  const accent = parsed(c.accent);

  // Secondary text: as close to the background as it can get while keeping AA
  // contrast on both the background and the surface.
  const muted = (function () {
    for (let k = 38; k >= 0; k -= 2) {
      const candidate = mix(text, bg, k / 100);
      if (
        contrast(candidate, bg) >= TEXT_CONTRAST_MIN &&
        contrast(candidate, surface) >= TEXT_CONTRAST_MIN
      ) {
        return toHex(candidate);
      }
    }
    return toHex(text);
  })();

  const faint = (function () {
    for (let k = 58; k >= 0; k -= 2) {
      const candidate = mix(text, bg, k / 100);
      if (contrast(candidate, bg) >= FAINT_CONTRAST_MIN) return toHex(candidate);
    }
    return toHex(text);
  })();

  // The accent pulled toward the text until it is readable on the background,
  // the surface, and both tinted with 14% accent (where soft badges sit).
  const bgTint = mix(bg, accent, 0.14);
  const surfaceTint = mix(surface, accent, 0.14);
  const accentInk = (function () {
    for (let k = 0; k <= 100; k += 2) {
      const candidate = mix(accent, text, k / 100);
      if (
        [bg, surface, bgTint, surfaceTint].every((b) => contrast(candidate, b) >= TEXT_CONTRAST_MIN)
      ) {
        return toHex(candidate);
      }
    }
    return toHex(text);
  })();

  // Text on accent fills. Black or white always has AA contrast with any
  // colour, so one of the candidates always works — same as the app.
  const onAccent = (function () {
    for (const candidate of [text, bg, BLACK, WHITE]) {
      if (contrast(candidate, accent) >= TEXT_CONTRAST_MIN) return toHex(candidate);
    }
    return toHex(BLACK);
  })();

  const alphas = dark
    ? { border: 0.08, strong: 0.14, hover: 0.05, active: 0.08 }
    : { border: 0.1, strong: 0.18, hover: 0.045, active: 0.08 };

  return {
    accentInk,
    muted,
    faint,
    accentSoft: toRgba(accent, dark ? 0.14 : 0.1),
    onAccent,
    border: toRgba(text, alphas.border),
    borderStrong: toRgba(text, alphas.strong),
    hover: toRgba(text, alphas.hover),
    active: toRgba(text, alphas.active),
    radius: RADII[look.shape],
  };
}
