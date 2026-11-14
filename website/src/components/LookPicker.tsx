"use client";

// The look picker: six chips, one per bundled look. Picking one re-themes
// the whole page. Arrow keys move the selection, like the app's pickers.

import { useLook } from "./LookProvider";
import { LOOKS, type Look } from "@/lib/looks";

function Swatch({ colors }: { colors: Look["colors"] }) {
  return (
    <svg width="26" height="18" viewBox="0 0 26 18" aria-hidden="true">
      <rect width="26" height="18" rx="4" fill={colors.bg} />
      <rect x="3" y="4" width="20" height="10" rx="2" fill={colors.surface} />
      <circle cx="20" cy="5" r="3" fill={colors.accent} />
    </svg>
  );
}

export function LookPicker() {
  const { look, setLookId } = useLook();

  const move = (delta: number) => {
    const i = LOOKS.findIndex((l) => l.id === look.id);
    const next = LOOKS[(i + delta + LOOKS.length) % LOOKS.length];
    if (next) setLookId(next.id);
  };

  return (
    <div
      className="picker"
      role="radiogroup"
      aria-labelledby="look-picker-label"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          move(1);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          move(-1);
        }
      }}
    >
      <p className="picker__label" id="look-picker-label">
        Site look — the whole page wears it
      </p>
      {LOOKS.map((l) => (
        <button
          key={l.id}
          type="button"
          role="radio"
          className="chip"
          aria-checked={l.id === look.id}
          tabIndex={l.id === look.id ? 0 : -1}
          onClick={() => setLookId(l.id)}
        >
          <Swatch colors={l.colors} />
          {l.name}
        </button>
      ))}
    </div>
  );
}
