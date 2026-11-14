import { describe, expect, it } from "vitest";
import { contrast, mix, parseHex, toHex, toRgba } from "@/lib/contrast";

describe("contrast maths", () => {
  it("parses the accepted hex forms and nothing else", () => {
    expect(parseHex("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex("#FF8fB1")).toEqual({ r: 255, g: 143, b: 177 });
    for (const bad of ["", "fff", "#ffff", "#ggg", "#fff5f780", "rgb(1,2,3)", "red", "#fff ", "url(x)"]) {
      expect(parseHex(bad)).toBeNull();
    }
  });

  it("matches the app's WCAG values", () => {
    const white = parseHex("#ffffff")!;
    const black = parseHex("#000000")!;
    expect(contrast(white, black)).toBeCloseTo(21.0, 9);
    const pink = parseHex("#ff8fb1")!;
    expect(contrast(pink, pink)).toBe(1.0);
    expect(contrast(white, black)).toBe(contrast(black, white));
  });

  it("mixes per channel, rounded half up", () => {
    const black = parseHex("#000000")!;
    const white = parseHex("#ffffff")!;
    expect(mix(black, white, 0.5)).toEqual({ r: 128, g: 128, b: 128 });
    expect(mix(black, white, 0)).toEqual(black);
    expect(mix(black, white, 1)).toEqual(white);
  });

  it("formats like the app", () => {
    expect(toHex({ r: 255, g: 143, b: 177 })).toBe("#ff8fb1");
    expect(toRgba({ r: 74, g: 44, b: 58 }, 0.045)).toBe("rgba(74, 44, 58, 0.045)");
    expect(toRgba({ r: 0, g: 0, b: 0 }, 0.1)).toBe("rgba(0, 0, 0, 0.1)");
  });
});
