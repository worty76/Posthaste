"use client";

// The real share-code idea, shown with the real code: a one-line code for
// the currently selected look, ready to copy. It encodes with the same
// format the app imports via "Add from code…" — no account, no upload.

import { useState } from "react";
import { useLook } from "./LookProvider";
import { encodeLookCode } from "@/lib/share-code";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function ShareCodeRow() {
  const { look } = useLook();
  const [copied, setCopied] = useState(false);
  const code = encodeLookCode(look);

  return (
    <div className="share-row">
      <p className="share-row__label" id="share-code-label">
        Share {look.name} as a code
      </p>
      <div className="share-row__row">
        <input
          className="share-row__code"
          aria-labelledby="share-code-label"
          value={code}
          readOnly
          onFocus={(e) => e.currentTarget.select()}
        />
        <button
          type="button"
          className="btn"
          onClick={() => {
            void copyText(code).then((ok) => {
              setCopied(ok);
              if (ok) window.setTimeout(() => setCopied(false), 2000);
            });
          }}
        >
          {copied ? "Copied" : "Copy code"}
        </button>
      </div>
      <p className="share-row__note" aria-live="polite">
        {copied
          ? "Copied. A friend pastes it into Add from code… — it never leaves the chat."
          : "Friends paste this into Add from code… — no account, no upload."}
      </p>
    </div>
  );
}
