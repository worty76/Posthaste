"use client";

// A working replica of the capture window on a fake desktop. Same rules as
// the product: Enter saves and closes, Shift+Enter is a new line,
// Ctrl/Cmd+Enter saves and stays, Escape closes and keeps the draft.
// The saved note drops into the mini inbox beside the desk.

import { useCallback, useEffect, useRef, useState } from "react";
import { Keys, SHORTCUTS, useOs } from "./os";

interface DemoNote {
  id: number;
  text: string;
}

interface Status {
  text: string;
  ok: boolean;
}

function isTyping(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA");
}

export function HeroDemo() {
  const os = useOs();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [notes, setNotes] = useState<DemoNote[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nextId = useRef(1);

  const openPanel = useCallback(() => {
    setOpen(true);
    setStatus(draft.trim() === "" ? null : { text: "Draft restored", ok: false });
  }, [draft]);

  const closePanel = useCallback(() => {
    setOpen(false);
    if (draft.trim() !== "")
      setStatus({ text: "Draft kept — it is here when you come back", ok: false });
  }, [draft]);

  const save = (keepOpen: boolean) => {
    if (draft.trim() === "") {
      setShake(true);
      setStatus({ text: "Nothing to save yet", ok: false });
      return;
    }
    const note = { id: nextId.current++, text: draft.trim() };
    setNotes((n) => [note, ...n]);
    setDraft("");
    setStatus({ text: "Saved", ok: true });
    if (!keepOpen) setOpen(false);
  };

  // The real shortcut opens the replica, unless the visitor is typing
  // somewhere else on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (open || isTyping(e.target)) return;
      const mod = os === "mac" ? e.metaKey : e.ctrlKey;
      if (mod && e.shiftKey && e.code === "Space") {
        e.preventDefault();
        openPanel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, os, openPanel]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // The headline's "Try it" button asks for the same thing as pressing the
  // shortcut.
  useEffect(() => {
    const onTry = () => {
      if (!open) openPanel();
    };
    window.addEventListener("posthaste:try", onTry);
    return () => window.removeEventListener("posthaste:try", onTry);
  }, [open, openPanel]);

  return (
    <div className="desk-wrap" id="demo">
      <div className="desk">
        <div className="mock" aria-hidden="true">
          <div className="mock__bar">Posthaste</div>
          <div className="mock__row">
            <i />
            <strong>Book the dentist</strong>
          </div>
          <div className="mock__row">
            <i />
            <strong>Idea: pocket notebook page</strong>
          </div>
          <div className="mock__row">
            <i />
            <strong>Watch: talk on type design</strong>
          </div>
        </div>

        {open ? (
          <div
            className={"replica replica--open" + (shake ? " replica--shake" : "")}
            onAnimationEnd={() => setShake(false)}
          >
            <div className="replica__head">
              <strong>Quick Note</strong>
              <span>from your browser</span>
            </div>
            <textarea
              ref={inputRef}
              className="replica__input"
              aria-label="Quick Note"
              placeholder="What's on your mind?"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  closePanel();
                } else if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  save(os === "mac" ? e.metaKey : e.ctrlKey);
                }
              }}
            />
            <div className="replica__foot">
              <span className="replica__hint">
                <kbd>↵</kbd> save
              </span>
              <span className="replica__hint">
                <kbd>⇧</kbd>
                <kbd>↵</kbd> new line
              </span>
              <span className="replica__hint">
                <kbd>esc</kbd> close, keeps a draft
              </span>
            </div>
          </div>
        ) : (
          <div className="desk__hint">
            <span>Press</span>
            <Keys keys={SHORTCUTS[os].capture} />
            <span>anywhere, or</span>
            <button type="button" className="btn btn--primary" onClick={openPanel}>
              Try it
            </button>
          </div>
        )}
      </div>

      <aside className="desk-notes" aria-label="Notes saved in this demo">
        <div className="desk-notes__head">Saved here</div>
        {notes.length === 0 ? (
          <p className="desk-notes__empty">Notes you save in the demo appear here.</p>
        ) : (
          <ul className="desk-notes__list" aria-live="polite">
            {notes.map((n) => (
              <li key={n.id} className="desk-note--new">
                {n.text}
              </li>
            ))}
          </ul>
        )}
      </aside>

      <p
        className="demo-status"
        data-ok={status?.ok ?? undefined}
        role="status"
        aria-live="polite"
        style={{ gridColumn: "1 / -1" }}
      >
        {status?.text ?? ""}
      </p>
    </div>
  );
}
