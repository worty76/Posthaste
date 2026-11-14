import { describe, expect, it } from "vitest";
import { LOOKS } from "@/lib/looks";
import { b64Decode, b64Encode, decodeLookCode, encodeLookCode, lookDocument } from "@/lib/share-code";

describe("share codes", () => {
  it("round-trips every bundled look back to its document", () => {
    for (const look of LOOKS) {
      const code = encodeLookCode(look);
      const decoded = decodeLookCode(code);
      expect(decoded).not.toBeNull();
      expect(JSON.parse(lookDocument(look))).toEqual(decoded);
    }
  });

  it("uses the app's prefix and a url-safe, unpadded alphabet", () => {
    for (const look of LOOKS) {
      const code = encodeLookCode(look);
      expect(code.startsWith("posthaste-look:1:")).toBe(true);
      expect(code).not.toMatch(/[+/=]/);
    }
  });

  it("rejects malformed input instead of throwing", () => {
    expect(decodeLookCode("hello")).toBeNull();
    expect(decodeLookCode("posthaste-look:1:???")).toBeNull();
    expect(decodeLookCode("posthaste-look:1:a")).toBeNull(); // length 1 mod 4
  });

  it("base64 round-trips bytes of every length up to 40", () => {
    const bytes: number[] = [];
    for (let i = 0; i < 41; i++) bytes.push(i % 256);
    for (let len = 0; len <= 40; len++) {
      const input = new Uint8Array(bytes.slice(0, len));
      const decoded = b64Decode(b64Encode(input));
      expect(decoded).not.toBeNull();
      expect(Array.from(decoded!)).toEqual(Array.from(input));
    }
  });
});
