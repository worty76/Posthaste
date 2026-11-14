// The only file that writes CSS custom properties. A look arrives as a token
// map produced by Rust; applying it sets properties on <html> and remembers
// what it set, so a later look (or none) can remove exactly those and never
// leave a stale token behind.

import type { ResolvedLook } from "./types";

let applied: string[] = [];

/** Applies a look's tokens plus `data-shape`/`data-font` to <html>. `null`
    removes everything a previous call set. Never touches `data-theme`, which
    belongs to the theme setting and the look's base. */
export function applyLook(look: ResolvedLook | null): void {
  const root = document.documentElement;
  for (const name of applied) {
    root.style.removeProperty(name);
  }
  applied = [];
  if (!look) {
    delete root.dataset.shape;
    delete root.dataset.font;
    return;
  }
  for (const [name, value] of Object.entries(look.tokens)) {
    root.style.setProperty(name, value);
    applied.push(name);
  }
  root.dataset.shape = look.shape;
  root.dataset.font = look.font;
}
