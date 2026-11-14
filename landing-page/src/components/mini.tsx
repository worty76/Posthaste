// A miniature of the app window, themed by its own look. The colours go in
// as CSS custom properties on the element — data-driven colours for look
// previews travel as custom properties/SVG fills, never as hard-coded
// copies of the look data.

import type { CSSProperties } from "react";
import type { Look } from "@/lib/looks";
import { deriveTokens } from "@/lib/derive";

export function lookVars(look: Look): CSSProperties {
  const t = deriveTokens(look);
  return {
    "--mini-bg": look.colors.bg,
    "--mini-surface": look.colors.surface,
    "--mini-text": look.colors.text,
    "--mini-accent": look.colors.accent,
    "--mini-ink": t.accentInk,
    "--mini-muted": t.muted,
    "--mini-soft": t.accentSoft,
    "--mini-on-accent": t.onAccent,
    "--mini-r-sm": t.radius[0],
    "--mini-r-md": t.radius[1],
  } as CSSProperties;
}

/** One bundled look as a live miniature of the app window. */
export function LookMiniature({
  look,
  note,
  category,
}: {
  look: Look;
  note: string;
  category: string;
}) {
  return (
    <figure className="look-figure">
      <div className="mini" style={lookVars(look)}>
        <div className="mini__bar">Quick Note</div>
        <div className="mini__body">
          <div className="mini__note">
            {note}
            <span className="mini__chip">#{category}</span>
          </div>
          <span className="mini__btn">Save</span>
        </div>
      </div>
      <figcaption>
        <span>{look.name}</span>
        <span>
          {look.base} · {look.shape}
        </span>
      </figcaption>
    </figure>
  );
}
