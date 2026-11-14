// Share codes, the same format the app speaks: "posthaste-look:1:" followed
// by unpadded base64url of the compact JSON, with keys in the app's order.

import { type Look } from "./looks";
import { parseHex, toHex } from "./contrast";

export const CODE_PREFIX = "posthaste-look:1:";

const B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Unpadded base64url. */
export function b64Encode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = i + 1 < bytes.length ? (bytes[i + 1] ?? 0) : 0;
    const b2 = i + 2 < bytes.length ? (bytes[i + 2] ?? 0) : 0;
    const n = (b0 << 16) | (b1 << 8) | b2;
    const keep = bytes.length - i >= 3 ? 4 : bytes.length - i === 2 ? 3 : 2;
    out += B64_ALPHABET.charAt((n >> 18) & 63);
    if (keep > 1) out += B64_ALPHABET.charAt((n >> 12) & 63);
    if (keep > 2) out += B64_ALPHABET.charAt((n >> 6) & 63);
    if (keep > 3) out += B64_ALPHABET.charAt(n & 63);
  }
  return out;
}

export function b64Decode(s: string): Uint8Array | null {
  if (s.length % 4 === 1) return null;
  const vals: number[] = [];
  for (const ch of s) {
    const v = B64_ALPHABET.indexOf(ch);
    if (v === -1) return null;
    vals.push(v);
  }
  const out: number[] = [];
  for (let i = 0; i < vals.length; i += 4) {
    const chunk = vals.slice(i, i + 4);
    const n =
      ((chunk[0] ?? 0) << 18) | ((chunk[1] ?? 0) << 12) | ((chunk[2] ?? 0) << 6) | (chunk[3] ?? 0);
    const keep = chunk.length >= 4 ? 3 : chunk.length === 3 ? 2 : 1;
    for (let j = 0; j < keep; j++) out.push((n >> (16 - 8 * j)) & 0xff);
  }
  return new Uint8Array(out);
}

/** Compact JSON in the app's exact key order. */
export function lookDocument(look: Look): string {
  return JSON.stringify({
    format: "posthaste-look",
    version: 1,
    name: look.name,
    author: "Posthaste",
    base: look.base,
    colors: {
      bg: look.colors.bg,
      surface: look.colors.surface,
      text: look.colors.text,
      accent: look.colors.accent,
    },
    shape: look.shape,
    font: look.font,
  });
}

export function encodeLookCode(look: Look): string {
  return CODE_PREFIX + b64Encode(new TextEncoder().encode(lookDocument(look)));
}

export interface DecodedLook {
  format: string;
  version: number;
  name: string;
  author?: string;
  base: "light" | "dark";
  colors: { bg: string; surface: string; text: string; accent: string };
  shape: "sharp" | "soft" | "round";
  font: "system" | "rounded" | "serif" | "mono";
}

export function decodeLookCode(code: string): DecodedLook | null {
  if (!code.startsWith(CODE_PREFIX)) return null;
  const bytes = b64Decode(code.slice(CODE_PREFIX.length));
  if (!bytes) return null;
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as DecodedLook;
  } catch {
    return null;
  }
}

/** Normalises a pasted look colour for the toy's picker. */
export function normalizedHex(value: string): string {
  const c = parseHex(value);
  return c === null ? "" : toHex(c);
}
