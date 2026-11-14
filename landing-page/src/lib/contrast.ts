// Colour parsing and WCAG maths, mirroring the app's look/color.rs so the
// site derives and validates exactly like the product does.

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** #rgb or #rrggbb, either case. Nothing else parses. */
export function parseHex(s: string): Rgb | null {
  const hex = s.startsWith("#") ? s.slice(1) : null;
  if (hex === null || !/^[0-9a-fA-F]+$/.test(hex)) return null;
  if (hex.length === 3) {
    const n = parseInt(hex, 16);
    return { r: ((n >> 8) & 0xf) * 17, g: ((n >> 4) & 0xf) * 17, b: (n & 0xf) * 17 };
  }
  if (hex.length === 6) {
    const n = parseInt(hex, 16);
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
  }
  return null;
}

export function toHex(c: Rgb): string {
  const byte = (n: number) => n.toString(16).padStart(2, "0");
  return `#${byte(c.r)}${byte(c.g)}${byte(c.b)}`;
}

export function toRgba(c: Rgb, alpha: number): string {
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
}

function channelLuminance(v: number): number {
  const c = v / 255;
  // WCAG 2.x: linearise sRGB below the 0.03928 threshold, gamma above it.
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function luminance(c: Rgb): number {
  return (
    0.2126 * channelLuminance(c.r) + 0.7152 * channelLuminance(c.g) + 0.0722 * channelLuminance(c.b)
  );
}

/** WCAG contrast ratio, 1 to 21, symmetric. */
export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = luminance(a) >= luminance(b) ? [a, b] : [b, a];
  return (luminance(hi) + 0.05) / (luminance(lo) + 0.05);
}

/** Per-channel linear interpolation, rounded half up. t=0 -> a, t=1 -> b. */
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const blend = (x: number, y: number) => Math.round(x + (y - x) * t);
  return { r: blend(a.r, b.r), g: blend(a.g, b.g), b: blend(a.b, b.b) };
}
