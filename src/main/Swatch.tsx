import type { JSX } from "react";
import type { LookPreview } from "../lib/types";

/** The small colour card in the gallery. Data-driven colours are passed as
    SVG fill attributes — look previews are the one place raw colour values
    travel through the UI, and only as attributes, never as style props. The
    Default card reads the live tokens instead. */
export function Swatch({ colors }: { colors: LookPreview | null }): JSX.Element {
  if (!colors) {
    return (
      <svg className="swatch" viewBox="0 0 48 32" aria-hidden="true">
        <rect className="swatch__default-bg" x="0" y="0" width="48" height="32" rx="6" />
        <rect className="swatch__default-surface" x="7" y="9" width="34" height="14" rx="4" />
        <circle className="swatch__default-accent" cx="37" cy="10" r="5" />
      </svg>
    );
  }
  return (
    <svg className="swatch" viewBox="0 0 48 32" aria-hidden="true">
      <rect x="0" y="0" width="48" height="32" rx="6" fill={colors.bg} />
      <rect x="7" y="9" width="34" height="14" rx="4" fill={colors.surface} />
      <circle cx="37" cy="10" r="5" fill={colors.accent} />
    </svg>
  );
}
