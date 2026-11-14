import { describe, expect, it } from "vitest";
import { LOOKS } from "@/lib/looks";
import { ACCENT_FILL_MIN, deriveTokens, TEXT_CONTRAST_MIN } from "@/lib/derive";
import { contrast, mix, parseHex } from "@/lib/contrast";

describe("derived tokens", () => {
  it("matches the app's Rust golden values", () => {
    // These are pinned in crates/core/src/look/tests.rs for the same looks;
    // the site's derivation must agree with the product to the digit.
    const strawberry = deriveTokens(LOOKS[0]!);
    expect(strawberry.muted).toBe("#806873");
    expect(strawberry.accentInk).toBe("#96566c");
    expect(strawberry.onAccent).toBe("#4a2c3a");
    expect(strawberry.accentSoft).toBe("rgba(255, 143, 177, 0.1)");

    const grape = deriveTokens(LOOKS[3]!);
    expect(grape.muted).toBe("#9f98ab");
    // The site holds hint text to AA (4.5:1 on the background), stricter
    // than the app's 3.0 for pure hints, so the app's faint golden does not
    // carry over here.
    expect(grape.accentInk).toBe("#c58bff");
    expect(grape.onAccent).toBe("#1a1423");

    const ink = deriveTokens(LOOKS[5]!);
    expect(ink.onAccent).toBe("#0f0f0f");
    expect(ink.accentSoft).toBe("rgba(255, 255, 255, 0.14)");
  });

  it("keeps every derived text token readable on every look", () => {
    for (const look of LOOKS) {
      const t = deriveTokens(look);
      const bg = parseHex(look.colors.bg)!;
      const surface = parseHex(look.colors.surface)!;
      const accent = parseHex(look.colors.accent)!;
      const muted = parseHex(t.muted)!;
      const ink = parseHex(t.accentInk)!;

      expect(contrast(muted, bg)).toBeGreaterThanOrEqual(TEXT_CONTRAST_MIN);
      expect(contrast(muted, surface)).toBeGreaterThanOrEqual(TEXT_CONTRAST_MIN);
      const faint = parseHex(t.faint)!;
      expect(contrast(faint, bg)).toBeGreaterThanOrEqual(TEXT_CONTRAST_MIN);
      // The ink rule: readable on bg, surface, and both tinted with 14%
      // accent (where soft badges sit) — not on the raw accent fill.
      const tints = [mix(bg, accent, 0.14), mix(surface, accent, 0.14)];
      expect(contrast(ink, bg)).toBeGreaterThanOrEqual(TEXT_CONTRAST_MIN);
      expect(contrast(ink, surface)).toBeGreaterThanOrEqual(TEXT_CONTRAST_MIN);
      for (const tint of tints) {
        expect(contrast(ink, tint)).toBeGreaterThanOrEqual(TEXT_CONTRAST_MIN);
      }
    }
  });

  it("uses the shape's radius", () => {
    expect(deriveTokens(LOOKS[5]!).radius).toEqual(["2px", "4px", "6px"]); // Ink, sharp
    expect(deriveTokens(LOOKS[0]!).radius).toEqual(["8px", "14px", "22px"]); // round
    expect(deriveTokens(LOOKS[1]!).radius).toEqual(["5px", "8px", "14px"]); // soft
  });

  it("keeps accent fills visible on every look", () => {
    for (const look of LOOKS) {
      expect(contrast(parseHex(look.colors.accent)!, parseHex(look.colors.bg)!)).toBeGreaterThanOrEqual(
        ACCENT_FILL_MIN,
      );
    }
  });
});
