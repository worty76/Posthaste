"use client";

import { useEffect, useState } from "react";

export type Os = "mac" | "windows" | "linux";

/** Best-effort OS detection from the user agent; SSR defaults to "mac" and
    the effect corrects it after hydration. */
export function useOs(): Os {
  const [os, setOs] = useState<Os>("mac");
  useEffect(() => {
    const ua = navigator.userAgent;
    if (/Mac/i.test(ua)) setOs("mac");
    else if (/Win/i.test(ua)) setOs("windows");
    else setOs("linux");
  }, []);
  return os;
}

export const SHORTCUTS: Record<Os, { capture: string[]; inbox: string[] }> = {
  mac: { capture: ["⌘", "⇧", "Space"], inbox: ["⌘", "⌃", "N"] },
  windows: { capture: ["Ctrl", "Shift", "Space"], inbox: ["Ctrl", "Alt", "N"] },
  linux: { capture: ["Ctrl", "Shift", "Space"], inbox: ["Ctrl", "Alt", "N"] },
};

export const OS_LABEL: Record<Os, string> = {
  mac: "macOS",
  windows: "Windows",
  linux: "Linux",
};

/** A key sequence as <kbd> chips. */
export function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="beat__keys">
      {keys.map((k) => (
        <kbd key={k}>{k}</kbd>
      ))}
    </span>
  );
}
