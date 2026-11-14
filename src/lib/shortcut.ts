import type { Os } from "./types";

const MODIFIER_CODES = new Set([
  "ControlLeft",
  "ControlRight",
  "ShiftLeft",
  "ShiftRight",
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight",
  "OSLeft",
  "OSRight",
]);

type KeyLike = Pick<KeyboardEvent, "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">;

function keyName(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^F\d{1,2}$/.test(code)) return code;
  if (/^Arrow(Up|Down|Left|Right)$/.test(code)) return code;
  const named = [
    "Space",
    "Enter",
    "Tab",
    "Backquote",
    "Minus",
    "Equal",
    "BracketLeft",
    "BracketRight",
    "Backslash",
    "Semicolon",
    "Quote",
    "Comma",
    "Period",
    "Slash",
    "Home",
    "End",
    "PageUp",
    "PageDown",
    "Insert",
    "Delete",
  ];
  return named.includes(code) ? code : null;
}

/**
 * Turns a key press into an accelerator string such as `Ctrl+Shift+Space`.
 * Returns null while only modifiers are held, or when the combination would
 * not make a usable global shortcut (no modifier, or Shift alone).
 */
export function acceleratorFromEvent(e: KeyLike, os: Os): string | null {
  if (MODIFIER_CODES.has(e.code)) return null;
  const key = keyName(e.code);
  if (!key) return null;
  const isFunctionKey = /^F\d{1,2}$/.test(key);
  if (!e.ctrlKey && !e.altKey && !e.metaKey && !isFunctionKey) return null;
  const parts: string[] = [];
  if (e.metaKey) parts.push(os === "macos" ? "Cmd" : "Super");
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push(key);
  return parts.join("+");
}

const MAC_SYMBOLS: Record<string, string> = {
  cmd: "⌘",
  command: "⌘",
  super: "⌘",
  ctrl: "⌃",
  control: "⌃",
  alt: "⌥",
  option: "⌥",
  shift: "⇧",
};

const KEY_LABELS: Record<string, string> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Enter: "↵",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
};

/** Splits an accelerator into the key caps to show for this platform. */
export function formatAccelerator(accelerator: string, os: Os): string[] {
  return accelerator
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower === "cmdorctrl" || lower === "commandorcontrol")
        return os === "macos" ? "⌘" : "Ctrl";
      if (os === "macos" && MAC_SYMBOLS[lower]) return MAC_SYMBOLS[lower];
      if (lower === "super") return os === "windows" ? "Win" : "Super";
      if (lower === "control") return "Ctrl";
      return KEY_LABELS[part] ?? part;
    });
}

/** The platform's primary modifier is held (⌘ on macOS, Ctrl elsewhere). */
export function hasMod(e: Pick<KeyboardEvent, "metaKey" | "ctrlKey">, os: Os): boolean {
  return os === "macos" ? e.metaKey : e.ctrlKey;
}
