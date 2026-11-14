import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { Kbd } from "../components/Kbd";
import { useAppearance } from "../hooks/useAppearance";
import { useSettings } from "../hooks/useSettings";
import { dayRange } from "../lib/dates";
import { api, on, toAppError } from "../lib/ipc";
import { formatAccelerator } from "../lib/shortcut";
import type { Glance, Note, Os } from "../lib/types";

export function TodayWindow({ os }: { os: Os }) {
  const { settings, shortcuts } = useSettings();
  useAppearance(settings);

  const [glance, setGlance] = useState<Glance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  /** Refetches with the current day's bounds, so the window is never stale
   * across midnight. `reset` drops the selection back to the first row. */
  const load = useCallback(async (reset: boolean) => {
    const { from, to } = dayRange(Date.now());
    try {
      const g = await api.glanceGet(from, to);
      setGlance(g);
      setError(null);
      setSelectedId((current) => {
        if (!reset) {
          const rows = [...g.carried, ...g.today];
          if (current && rows.some((n) => n.id === current)) return current;
        }
        return g.carried[0]?.id ?? g.today[0]?.id ?? null;
      });
    } catch (e) {
      setError(toAppError(e).message);
    }
  }, []);

  useEffect(() => {
    void load(false);
    listRef.current?.focus();
  }, [load]);

  // Shown again by the shortcut: today's bounds may have moved, and the
  // user's eyes start at the top.
  useEffect(
    () =>
      on("today-shown", () => {
        void load(true);
        listRef.current?.focus();
      }),
    [load],
  );
  // Notes changed elsewhere (capture, inbox): refresh, keep the selection.
  useEffect(() => on("notes-changed", () => void load(false)), [load]);

  const rows = useMemo(() => (glance ? [...glance.carried, ...glance.today] : []), [glance]);
  const selectedIndex = rows.findIndex((n) => n.id === selectedId);
  const selected = selectedIndex >= 0 ? rows[selectedIndex] : undefined;

  const toggle = (note: Note) => {
    const status = note.status === "completed" ? "inbox" : "completed";
    void api.noteSetStatus(note.id, status).then(
      () => undefined,
      (e) => setError(toAppError(e).message),
    );
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "Escape") {
      e.preventDefault();
      void api.todayDismiss().catch(() => undefined);
      return;
    }
    const move = (delta: number) => {
      e.preventDefault();
      const next = rows[selectedIndex < 0 ? 0 : selectedIndex + delta] ?? selected;
      if (next) setSelectedId(next.id);
    };
    if (e.key === "ArrowDown" || e.key === "j") return move(1);
    if (e.key === "ArrowUp" || e.key === "k") return move(-1);
    if (e.key.toLowerCase() === "x" && selected) {
      e.preventDefault();
      toggle(selected);
    }
  };

  const dateLabel = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(Date.now());

  const captureKeys =
    shortcuts?.capture.registered && shortcuts.capture.accelerator
      ? formatAccelerator(shortcuts.capture.accelerator, os)
      : null;

  const shown = glance ? glance.carried.length + glance.today.length : 0;
  const more = glance ? glance.total - shown : 0;
  const allDone = glance !== null && glance.total > 0 && glance.done === glance.total;
  const groups = glance
    ? [
        { label: "Carried over", notes: glance.carried },
        { label: "Today", notes: glance.today },
      ].filter((g) => g.notes.length > 0)
    : [];

  return (
    <div className="today" onKeyDown={onKeyDown}>
      <section className="today__panel" aria-label="Today">
        <header className="today__header" data-tauri-drag-region>
          <h1 className="today__date">{dateLabel}</h1>
          {glance && (
            <>
              <p className="today__count" data-all-done={allDone || undefined}>
                {allDone ? "All done" : `${glance.done} of ${glance.total} done`}
              </p>
              <progress
                className="today__bar"
                value={glance.done}
                max={glance.total}
                aria-label="Notes done"
              />
            </>
          )}
        </header>

        {error ? (
          <p className="today__error" role="alert">
            {error}
          </p>
        ) : glance && glance.total === 0 ? (
          <EmptyState title="Nothing for today">
            {captureKeys ? (
              <>
                Press <Kbd keys={captureKeys} /> anywhere to capture one.
              </>
            ) : (
              "Capture one from anywhere with Posthaste."
            )}
          </EmptyState>
        ) : (
          <>
            <div ref={listRef} className="today__list" tabIndex={-1}>
              {groups.map((g) => (
                <section key={g.label} className="today__group" aria-label={g.label}>
                  <h2 className="today__group-label">{g.label}</h2>
                  <ul className="today__rows">
                    {g.notes.map((n) => (
                      <GlanceRow
                        key={n.id}
                        note={n}
                        selected={n.id === selectedId}
                        onToggle={toggle}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
            {more > 0 && <p className="today__more">and {more} more in the inbox</p>}
          </>
        )}

        <footer className="today__hints" aria-hidden="true">
          <span className="today__hint">
            <Kbd keys={["↑", "↓"]} /> move
          </span>
          <span className="today__hint">
            <Kbd keys={["X"]} /> done
          </span>
          <span className="today__hint">
            <Kbd keys={["esc"]} /> close
          </span>
        </footer>
      </section>
    </div>
  );
}

function GlanceRow({
  note,
  selected,
  onToggle,
}: {
  note: Note;
  selected: boolean;
  onToggle: (note: Note) => void;
}) {
  const done = note.status === "completed";
  return (
    <li
      className="today__row"
      data-selected={selected}
      data-status={note.status}
      aria-current={selected || undefined}
    >
      <button
        type="button"
        role="checkbox"
        className="check"
        aria-checked={done}
        aria-label={done ? "Mark as not completed" : "Mark as completed"}
        onClick={() => onToggle(note)}
      >
        <Icon name="check" size={12} />
      </button>
      <p className="today__text selectable">{note.content}</p>
    </li>
  );
}
