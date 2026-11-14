"use client";

// A small interactive inbox with the app's real keys: J/K moves, X
// completes, / filters. The notes are obviously made-up everyday thoughts,
// not quotes from users.

import { useRef, useState } from "react";

interface SampleNote {
  id: number;
  text: string;
  category: string;
}

const SAMPLES: SampleNote[] = [
  { id: 1, text: "Return the library books", category: "home" },
  { id: 2, text: "Idea: label the sourdough starter", category: "ideas" },
  { id: 3, text: "Ask Priya for the design file", category: "work" },
  { id: 4, text: "Watch: talk on type design", category: "watch" },
  { id: 5, text: "Buy oat milk", category: "home" },
];

export function MiniInbox() {
  const [selected, setSelected] = useState(0);
  const [filter, setFilter] = useState("");
  const [doneIds, setDoneIds] = useState<number[]>([]);
  const filterRef = useRef<HTMLInputElement>(null);

  const needle = filter.trim().toLowerCase();
  const visible = SAMPLES.filter(
    (n) =>
      needle === "" ||
      n.text.toLowerCase().includes(needle) ||
      n.category.toLowerCase().includes(needle),
  );
  const isDone = (id: number) => doneIds.includes(id);

  const toggleDone = (id: number) =>
    setDoneIds((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));

  const onKeyDown = (e: React.KeyboardEvent) => {
    const inFilter = e.target === filterRef.current;
    if (e.key === "Escape") {
      if (inFilter) {
        setFilter("");
        e.preventDefault();
      }
      return;
    }
    if (inFilter) return;
    if (e.key === "/") {
      e.preventDefault();
      filterRef.current?.focus();
    } else if (e.key === "j" || e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, Math.max(visible.length - 1, 0)));
    } else if (e.key === "k" || e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "x") {
      const note = visible[selected];
      if (note) toggleDone(note.id);
    }
  };

  const selectedNote = visible[selected];

  return (
    <div className="inbox-demo" onKeyDown={onKeyDown}>
      <div className="inbox-demo__bar">
        <input
          ref={filterRef}
          type="text"
          aria-label="Filter the sample inbox"
          placeholder="Filter — press / from the list"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setSelected(0);
          }}
        />
        <span
          className="kbd-hint"
          aria-live="polite"
          style={{ alignSelf: "center", color: "var(--muted)", fontSize: "var(--t-xs)" }}
        >
          {visible.length} of {SAMPLES.length}
        </span>
      </div>
      <ul className="inbox-demo__list" role="listbox" aria-label="Sample inbox — try J, K, X and /">
        {visible.map((n, i) => (
          <li key={n.id} role="option" aria-selected={i === selected}>
            <button
              type="button"
              className={"note-row" + (isDone(n.id) ? " note-row--done" : "")}
              onClick={() => setSelected(i)}
            >
              <i aria-hidden="true" />
              <span className="note-row__text">
                {n.text}
                <span
                  className="mini__chip"
                  style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}
                >
                  #{n.category}
                </span>
              </span>
              <span className="kbd-hint">{isDone(n.id) ? "done" : "X"}</span>
            </button>
          </li>
        ))}
        {visible.length === 0 && (
          <li style={{ padding: "10px 12px", color: "var(--muted)", fontSize: "var(--t-sm)" }}>
            Nothing matches “{filter}”.
          </li>
        )}
      </ul>
      {selectedNote && (
        <div
          style={{
            display: "flex",
            gap: "8px",
            padding: "8px 12px",
            borderTop: "1px solid var(--border)",
          }}
        >
          <button
            type="button"
            className="btn btn--quiet"
            onClick={() => toggleDone(selectedNote.id)}
          >
            {isDone(selectedNote.id) ? "Reopen" : "Complete"} <kbd>X</kbd>
          </button>
          <span
            className="kbd-hint"
            style={{ alignSelf: "center", color: "var(--muted)", fontSize: "var(--t-xs)" }}
          >
            {isDone(selectedNote.id)
              ? "Completed notes move to Archive in the app."
              : "J/K move · X completes · / filters"}
          </span>
        </div>
      )}
    </div>
  );
}
