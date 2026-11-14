"use client";

// "Make your own", shrunk to the page: four colours, a live miniature, and
// the app's real validator. The wording of a rejection is the app's wording.

import { useEffect, useMemo, useState } from "react";
import { useLook } from "./LookProvider";
import { contrast, parseHex, toHex } from "@/lib/contrast";
import { TEXT_CONTRAST_MIN, ACCENT_FILL_MIN } from "@/lib/derive";

type Colors = { bg: string; surface: string; text: string; accent: string };

const FIELDS: { key: keyof Colors; label: string }[] = [
  { key: "bg", label: "Background" },
  { key: "surface", label: "Surface" },
  { key: "text", label: "Text" },
  { key: "accent", label: "Accent" },
];

export function ContrastToy() {
  const { look } = useLook();
  const [colors, setColors] = useState<Colors>(look.colors);

  // Starting from the visitor's current look makes the toy feel connected.
  useEffect(() => setColors(look.colors), [look]);

  const warnings = useMemo(() => {
    const bg = parseHex(colors.bg);
    const text = parseHex(colors.text);
    const accent = parseHex(colors.accent);
    const out: string[] = [];
    if (bg && text) {
      const ratio = contrast(text, bg);
      if (ratio < TEXT_CONTRAST_MIN) {
        out.push(
          `Text and background are too similar to read comfortably (${ratio.toFixed(1)}:1, needs 4.5:1).`,
        );
      }
    }
    if (bg && accent) {
      const ratio = contrast(accent, bg);
      if (ratio < ACCENT_FILL_MIN) {
        out.push(
          "The accent is almost invisible on the background. Pick a color that stands out more.",
        );
      }
    }
    return out;
  }, [colors]);

  const set = (key: keyof Colors) => (value: string) => {
    const hex = parseHex(value);
    if (hex) setColors((c) => ({ ...c, [key]: toHex(hex) }));
  };

  // Text on the accent fill: first of text, bg, black, white with AA
  // contrast — the app's rule for --on-accent.
  const onAccent =
    [colors.text, colors.bg, "#000000", "#ffffff"].find(
      (c) => contrast(parseHex(colors.accent)!, parseHex(c)!) >= TEXT_CONTRAST_MIN,
    ) ?? "#000000";

  const vars = {
    "--toy-bg": colors.bg,
    "--toy-surface": colors.surface,
    "--toy-text": colors.text,
    "--toy-accent": colors.accent,
    "--toy-on-accent": onAccent,
  } as React.CSSProperties;

  return (
    <div className="toy">
      <div className="toy__fields">
        {FIELDS.map((f) => (
          <label className="toy__field" key={f.key}>
            {f.label}
            <input
              type="color"
              value={colors[f.key]}
              onChange={(e) => set(f.key)(e.target.value)}
              aria-label={`${f.label} colour`}
            />
          </label>
        ))}
        <div className="toy__verdict" aria-live="polite">
          {warnings.length === 0 ? (
            <p className="toy__ok">Looks good.</p>
          ) : (
            warnings.map((w) => (
              <p key={w} role="alert">
                {w}
              </p>
            ))
          )}
          <p>This is the same check the app runs before a look can be saved.</p>
        </div>
        <button type="button" className="btn toy__reset" onClick={() => setColors(look.colors)}>
          Reset to {look.name}
        </button>
      </div>
      <div className="toy__preview" style={vars} aria-label="Preview of your colours">
        <strong style={{ fontSize: "var(--t-sm)" }}>Quick Note</strong>
        <div className="toy__card">Return the library books</div>
        <span className="toy__btn">Save</span>
      </div>
    </div>
  );
}
