"use client";

// The three beats with real key combinations per OS. Detected OS is
// highlighted after mount; without JavaScript all three stay visible and
// the toggle is not rendered at all.

import { useEffect, useState } from "react";
import { Keys, OS_LABEL, SHORTCUTS, useOs, type Os } from "./os";

const OSES: Os[] = ["mac", "windows", "linux"];

export function HowItWorks() {
  const detected = useOs();
  const [mounted, setMounted] = useState(false);
  const [chosen, setChosen] = useState<Os>("mac");

  useEffect(() => {
    setChosen(detected);
    setMounted(true);
  }, [detected]);

  return (
    <div className="section__body">
      {mounted && (
        <div className="os-toggle" role="group" aria-label="Show keys for">
          {OSES.map((o) => (
            <button
              key={o}
              type="button"
              className="chip"
              aria-pressed={chosen === o}
              onClick={() => setChosen(o)}
            >
              {OS_LABEL[o]}
            </button>
          ))}
        </div>
      )}
      <div className="beats" data-os={mounted ? chosen : undefined}>
        <div className="beat">
          <h3>Press the shortcut</h3>
          <p>
            Works in any app — writing, browsing, chatting. A small window appears, ready to type.
          </p>
          {OSES.map((o) => (
            <span key={o} className="beat__keys" data-os={o}>
              <Keys keys={SHORTCUTS[o].capture} />
            </span>
          ))}
        </div>
        <div className="beat">
          <h3>Type, press Enter</h3>
          <p>
            That's it — the note is saved. Need a second thought? The window stays open for one
            more.
          </p>
          <span className="beat__keys" data-os="all">
            <kbd>↵</kbd>
            <kbd>⇧</kbd>
            <kbd>↵</kbd>
            <kbd>⌘/Ctrl</kbd>
            <kbd>↵</kbd>
          </span>
        </div>
        <div className="beat">
          <h3>You're back</h3>
          <p>Focus returns to whatever you were doing. The note waits in your inbox for later.</p>
          <span className="beat__keys" data-os="all">
            <kbd>esc</kbd>
            <span style={{ alignSelf: "center", fontSize: "var(--t-xs)", color: "var(--muted)" }}>
              keeps a draft instead
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
