"use client";

// The hero's two actions. "Try it" asks the demo to open via an event —
// the button lives in the headline column, the demo lives in the desk.

import { Keys, SHORTCUTS, useOs } from "./os";

export function HeroActions() {
  const os = useOs();
  return (
    <div className="hero__actions">
      <a className="btn btn--primary" href="#get-it">
        Download
      </a>
      <button
        type="button"
        className="btn"
        onClick={() => window.dispatchEvent(new CustomEvent("posthaste:try"))}
      >
        Try it <Keys keys={SHORTCUTS[os].capture} />
      </button>
    </div>
  );
}
