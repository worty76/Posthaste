"use client";

// Applies the chosen look to <html> and hands it to every client island.
// This is the only place that writes CSS custom properties on the page —
// the site's equivalent of the app's lib/appearance.ts. The choice lives in
// memory for the session only: no cookies, no storage.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { LOOKS, defaultLookId, lookById, type Look } from "@/lib/looks";
import { deriveTokens } from "@/lib/derive";

interface LookContextValue {
  look: Look;
  setLookId: (id: string) => void;
}

const LookContext = createContext<LookContextValue | null>(null);

export function useLook(): LookContextValue {
  const value = useContext(LookContext);
  if (!value) throw new Error("useLook must be used inside LookProvider");
  return value;
}

export function LookProvider({ children }: { children: ReactNode }) {
  // Server render starts on the light default; the effect below corrects
  // to the visitor's colour scheme before they can notice.
  const [lookId, setLookId] = useState<string>(defaultLookId(false));
  const [picked, setPicked] = useState(false);

  // Until the visitor picks, follow the OS colour scheme (Blueberry for
  // dark, Strawberry Milk for light).
  useEffect(() => {
    if (picked) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setLookId(defaultLookId(media.matches));
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [picked]);

  const look = lookById(lookId) ?? LOOKS[0];

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.look = look.id;
    root.dataset.shape = look.shape;
    root.dataset.font = look.font;
    const t = deriveTokens(look);
    const props: [string, string][] = [
      ["--bg", look.colors.bg],
      ["--surface", look.colors.surface],
      ["--text", look.colors.text],
      ["--accent", look.colors.accent],
      ["--accent-ink", t.accentInk],
      ["--accent-soft", t.accentSoft],
      ["--on-accent", t.onAccent],
      ["--muted", t.muted],
      ["--faint", t.faint],
      ["--border", t.border],
      ["--border-strong", t.borderStrong],
      ["--hover", t.hover],
      ["--active", t.active],
      ["--r-sm", t.radius[0]],
      ["--r-md", t.radius[1]],
      ["--r-lg", t.radius[2]],
    ];
    for (const [name, value] of props) root.style.setProperty(name, value);
    return () => {
      for (const [name] of props) root.style.removeProperty(name);
    };
  }, [look]);

  return (
    <LookContext.Provider
      value={{
        look,
        setLookId: (id) => {
          setLookId(id);
          setPicked(true);
        },
      }}
    >
      {children}
    </LookContext.Provider>
  );
}
