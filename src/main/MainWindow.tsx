import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, IconButton } from "../components/Button";
import { Segmented, TextField } from "../components/Controls";
import { Dialog } from "../components/Dialog";
import { EmptyState } from "../components/EmptyState";
import { Icon, type IconName } from "../components/Icon";
import { Kbd } from "../components/Kbd";
import { Toasts, useToasts } from "../components/Toasts";
import { useAppearance } from "../hooks/useAppearance";
import { useSettings } from "../hooks/useSettings";
import { copyText } from "../lib/clipboard";
import { dayRange, groupByDay } from "../lib/dates";
import { api, on, toAppError } from "../lib/ipc";
import { buildQuery, isSearching, NO_FILTERS, type Filters, type StatusFilter } from "../lib/query";
import { formatAccelerator, hasMod } from "../lib/shortcut";
import type { AppInfo, Counts, Note, Status, View } from "../lib/types";
import { NoteCard, type NoteActions } from "./NoteCard";
import { SettingsView } from "./SettingsView";

const PAGE = 200;
const TITLES: Record<View, string> = {
  inbox: "Inbox",
  today: "Today",
  archive: "Archive",
  settings: "Settings",
};
const NAV: { view: Exclude<View, "settings">; icon: IconName }[] = [
  { view: "inbox", icon: "inbox" },
  { view: "today", icon: "sun" },
  { view: "archive", icon: "archive" },
];

function isView(v: string): v is View {
  return v in TITLES;
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

export function MainWindow({ info }: { info: AppInfo }) {
  const { settings, shortcuts, update, accept } = useSettings();
  useAppearance(settings);
  const { toasts, show, dismiss } = useToasts();

  const [view, setView] = useState<View>("inbox");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  /** Bumped to re-run the list query (data changed, or a new day began). */
  const [revision, setRevision] = useState(0);

  const searchRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
  const searching = isSearching(filters);
  const os = info.os;

  const fail = useCallback((e: unknown) => show(toAppError(e).message, { kind: "error" }), [show]);

  // ---- data ----------------------------------------------------------------

  useEffect(() => {
    if (view === "settings") return;
    const id = ++requestId.current;
    const now = Date.now();
    // A short pause while typing keeps a fast typist from queueing queries.
    const timer = setTimeout(
      () => {
        api
          .notesList({ ...buildQuery(view, filters, now), limit: limit + 1 })
          .then((rows) => {
            if (id !== requestId.current) return; // a newer query superseded this one
            setNotes(rows);
            setLoaded(true);
          })
          .catch((e) => {
            if (id === requestId.current) fail(e);
          });
      },
      filters.text ? 90 : 0,
    );
    return () => clearTimeout(timer);
  }, [view, filters, limit, revision, fail]);

  useEffect(() => {
    const { from, to } = dayRange(Date.now());
    api.notesCounts(from, to).then(setCounts, () => undefined);
  }, [revision]);

  useEffect(() => on("notes-changed", () => setRevision((r) => r + 1)), []);
  useEffect(() => {
    // "Today" depends on the clock: refresh when the window comes back.
    const refresh = () => setRevision((r) => r + 1);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  const go = useCallback((next: View) => {
    setView(next);
    setFilters(NO_FILTERS);
    setFiltersOpen(false);
    setLimit(PAGE);
    setEditingId(null);
    setSelectedId(null);
    setLoaded(false);
  }, []);

  useEffect(
    () =>
      on("navigate", (target) => {
        if (isView(target)) go(target);
      }),
    [go],
  );

  const visible = useMemo(() => notes.slice(0, limit), [notes, limit]);
  const hasMore = notes.length > limit;
  const groups = useMemo(() => groupByDay(visible, Date.now()), [visible]);

  // ---- actions ---------------------------------------------------------------

  const setStatus = useCallback(
    async (note: Note, status: Status, message: string) => {
      try {
        await api.noteSetStatus(note.id, status);
        show(message, {
          action: {
            label: "Undo",
            run: () => void api.noteSetStatus(note.id, note.status).catch(fail),
          },
        });
      } catch (e) {
        fail(e);
      }
    },
    [show, fail],
  );

  const actions: NoteActions = useMemo(
    () => ({
      select: setSelectedId,
      toggleComplete: (note) =>
        note.status === "completed"
          ? void setStatus(note, "inbox", "Marked as not completed")
          : void setStatus(note, "completed", "Completed"),
      archive: (note) => void setStatus(note, "archived", "Archived"),
      restore: (note) => void setStatus(note, "inbox", "Moved back to Inbox"),
      remove: (note) => {
        api.noteDelete(note.id).then(
          () =>
            show("Note deleted", {
              action: {
                label: "Undo",
                run: () => void api.noteUndelete(note.id).catch(fail),
              },
            }),
          fail,
        );
      },
      copy: (note) => {
        void copyText(note.content).then((ok) =>
          ok ? show("Copied") : show("Could not copy to the clipboard", { kind: "error" }),
        );
      },
      startEdit: (id) => {
        setSelectedId(id);
        setEditingId(id);
      },
      cancelEdit: () => setEditingId(null),
      saveEdit: async (note, content, category) => {
        try {
          await api.noteUpdate(note.id, content, category);
          setEditingId(null);
          return true;
        } catch (e) {
          fail(e);
          return false;
        }
      },
    }),
    [setStatus, show, fail],
  );

  // ---- keyboard --------------------------------------------------------------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      const mod = hasMod(e, os);

      if (mod && e.key === ",") {
        e.preventDefault();
        go("settings");
        return;
      }
      if (mod && e.key.toLowerCase() === "f") {
        e.preventDefault();
        if (view === "settings") go("inbox");
        requestAnimationFrame(() => searchRef.current?.focus());
        return;
      }
      if (mod && e.key.toLowerCase() === "n") {
        e.preventDefault();
        void api.captureOpen();
        return;
      }

      if (isTyping(e.target)) {
        if (e.key === "Escape" && e.target === searchRef.current) {
          e.preventDefault();
          setFilters(NO_FILTERS);
          searchRef.current?.blur();
        } else if (e.key === "ArrowDown" && e.target === searchRef.current && visible[0]) {
          e.preventDefault();
          searchRef.current?.blur();
          setSelectedId(visible[0].id);
        }
        return;
      }
      if (mod || e.altKey) return;

      if (e.key === "1") return go("inbox");
      if (e.key === "2") return go("today");
      if (e.key === "3") return go("archive");
      if (e.key === "?") return setHelpOpen(true);
      if (e.key === "/") {
        e.preventDefault();
        if (view === "settings") go("inbox");
        requestAnimationFrame(() => searchRef.current?.focus());
        return;
      }
      if (e.key === "n") return void api.captureOpen();
      if (view === "settings") return;

      const index = visible.findIndex((n) => n.id === selectedId);
      const current = index >= 0 ? visible[index] : undefined;
      const move = (delta: number) => {
        e.preventDefault();
        const next =
          visible[index < 0 ? (delta > 0 ? 0 : visible.length - 1) : index + delta] ?? current;
        if (next) setSelectedId(next.id);
      };
      if (e.key === "ArrowDown" || e.key === "j") return move(1);
      if (e.key === "ArrowUp" || e.key === "k") return move(-1);
      if (e.key === "Escape") {
        if (searching) setFilters(NO_FILTERS);
        else setSelectedId(null);
        return;
      }
      if (!current) return;

      // After acting on a note, keep the selection moving down the list.
      const advance = () => setSelectedId((visible[index + 1] ?? visible[index - 1])?.id ?? null);
      // Buttons and links handle their own Enter and Space.
      const onControl = (e.target as HTMLElement | null)?.closest?.("button, a, [role=radio]");
      switch (e.key) {
        case "Enter":
        case "e":
          if (e.key === "Enter" && onControl) return;
          e.preventDefault();
          actions.startEdit(current.id);
          break;
        case " ":
        case "x":
          if (e.key === " " && onControl) return;
          e.preventDefault();
          actions.toggleComplete(current);
          if (view === "inbox" && !searching) advance();
          break;
        case "a":
          if (current.status !== "archived") {
            actions.archive(current);
            if (view === "inbox" && !searching) advance();
          }
          break;
        case "r":
          if (current.status !== "inbox") {
            actions.restore(current);
            if (view === "archive" && !searching) advance();
          }
          break;
        case "c":
          actions.copy(current);
          break;
        case "Delete":
        case "Backspace":
          e.preventDefault();
          actions.remove(current);
          advance();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [os, view, visible, selectedId, searching, actions, go]);

  // ---- render ----------------------------------------------------------------

  const captureKeys =
    shortcuts?.capture.registered && shortcuts.capture.accelerator
      ? formatAccelerator(shortcuts.capture.accelerator, os)
      : null;
  const count = (v: View) => (v === "inbox" ? counts?.inbox : v === "today" ? counts?.today : null);

  return (
    <div className={`app os-${os}`}>
      <aside className="sidebar">
        <div className="sidebar__brand">Posthaste</div>
        <nav className="nav" aria-label="Sections">
          {NAV.map(({ view: v, icon }) => (
            <button
              key={v}
              type="button"
              className="nav__item"
              aria-current={view === v && !searching ? "page" : undefined}
              onClick={() => go(v)}
            >
              <Icon name={icon} />
              <span className="nav__label">{TITLES[v]}</span>
              {count(v) ? <span className="nav__count">{count(v)}</span> : null}
            </button>
          ))}
        </nav>
        <div className="sidebar__spacer" />
        <Button className="sidebar__new" onClick={() => void api.captureOpen()}>
          New note
          {captureKeys && <Kbd keys={captureKeys} />}
        </Button>
        <button
          type="button"
          className="nav__item"
          aria-current={view === "settings" ? "page" : undefined}
          onClick={() => go("settings")}
        >
          <Icon name="settings" />
          <span className="nav__label">Settings</span>
        </button>
      </aside>

      <main className="content">
        <header className="content__header" data-tauri-drag-region={os === "macos" || undefined}>
          <h1 className="content__title">{searching ? "Search" : TITLES[view]}</h1>
          {view !== "settings" && (
            <div className="search" role="search">
              <span className="search__icon">
                <Icon name="search" size={14} />
              </span>
              <TextField
                ref={searchRef}
                type="text"
                aria-label="Search all notes"
                placeholder="Search all notes"
                value={filters.text}
                onChange={(e) => {
                  setLimit(PAGE);
                  setFilters((f) => ({ ...f, text: e.target.value }));
                }}
                spellCheck={false}
              />
              {searching && (
                <IconButton
                  className="search__clear"
                  icon="close"
                  label="Clear search"
                  onClick={() => setFilters(NO_FILTERS)}
                />
              )}
            </div>
          )}
          {view !== "settings" && (
            <IconButton
              icon="filter"
              label="Filter by status or date"
              aria-expanded={searching || filtersOpen}
              onClick={() => setFiltersOpen((v) => !v)}
            />
          )}
        </header>

        {shortcuts && !shortcuts.capture.registered && view !== "settings" && (
          <div className="banner" role="alert">
            <div className="banner__text">
              <span className="banner__title">The capture shortcut isn't active. </span>
              {shortcuts.capture.error}
            </div>
            <Button onClick={() => go("settings")}>Change shortcut</Button>
          </div>
        )}

        {view !== "settings" && (searching || filtersOpen) && (
          <div className="filters">
            <Segmented<StatusFilter>
              label="Status"
              value={filters.status}
              disabled={!searching}
              options={[
                { value: "all", label: "All" },
                { value: "open", label: "Open" },
                { value: "completed", label: "Completed" },
                { value: "archived", label: "Archived" },
              ]}
              onChange={(status) => setFilters((f) => ({ ...f, status }))}
            />
            <TextField
              type="date"
              aria-label="Captured on date"
              title="Show notes captured on a date"
              data-empty={filters.date === ""}
              value={filters.date}
              onChange={(e) => {
                setLimit(PAGE);
                setFilters((f) => ({ ...f, date: e.target.value }));
              }}
            />
            {searching && loaded && (
              <span className="filters__count" aria-live="polite">
                {visible.length === 0
                  ? "No matches"
                  : `${visible.length}${hasMore ? "+" : ""} ${visible.length === 1 ? "note" : "notes"}`}
              </span>
            )}
          </div>
        )}

        <div className="content__scroll">
          <div className="content__column">
            {view === "settings" ? (
              settings && shortcuts ? (
                <SettingsView
                  info={info}
                  settings={settings}
                  shortcuts={shortcuts}
                  update={update}
                  accept={accept}
                  notify={(text, kind) => show(text, { kind })}
                />
              ) : null
            ) : !loaded ? null : visible.length === 0 ? (
              <Empty view={view} filters={filters} captureKeys={captureKeys} />
            ) : (
              <>
                {groups.map((g) => (
                  <section key={g.key} className="day" aria-label={g.label}>
                    <h2 className="day__label">
                      {g.label}
                      <span className="day__count">{g.notes.length}</span>
                    </h2>
                    <ul className="notes">
                      {g.notes.map((n) => (
                        <NoteCard
                          key={n.id}
                          note={n}
                          selected={n.id === selectedId}
                          editing={n.id === editingId}
                          actions={actions}
                        />
                      ))}
                    </ul>
                  </section>
                ))}
                {hasMore && (
                  <Button className="more" onClick={() => setLimit((l) => l + PAGE)}>
                    Show older notes
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </main>

      <Toasts toasts={toasts} dismiss={dismiss} />
      <ShortcutHelp
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        mod={os === "macos" ? "⌘" : "Ctrl"}
      />
    </div>
  );
}

function Empty({
  view,
  filters,
  captureKeys,
}: {
  view: View;
  filters: Filters;
  captureKeys: string[] | null;
}) {
  if (isSearching(filters)) {
    return (
      <EmptyState title="No notes match">
        {filters.text.trim()
          ? `Nothing contains “${filters.text.trim()}”${filters.date || filters.status !== "all" ? " with these filters" : ""}. Search looks through every note, including the archive.`
          : "Nothing was captured on that date."}
      </EmptyState>
    );
  }
  if (view === "today") {
    return (
      <EmptyState title="Nothing captured today">Notes you capture today show up here.</EmptyState>
    );
  }
  if (view === "archive") {
    return (
      <EmptyState title="The archive is empty">
        Notes you complete or archive move here, out of the way but still searchable.
      </EmptyState>
    );
  }
  return (
    <EmptyState title="Your inbox is clear">
      {captureKeys ? (
        <>
          Press <Kbd keys={captureKeys} /> in any application to capture a thought. It will be
          waiting here.
        </>
      ) : (
        "Use New note to capture a thought. It will be waiting here."
      )}
    </EmptyState>
  );
}

function ShortcutHelp({ open, onClose, mod }: { open: boolean; onClose: () => void; mod: string }) {
  const rows: [string, string[]][] = [
    ["Move through notes", ["↑", "↓"]],
    ["Edit", ["E"]],
    ["Complete", ["X"]],
    ["Archive", ["A"]],
    ["Move back to Inbox", ["R"]],
    ["Copy", ["C"]],
    ["Delete", ["Del"]],
    ["Search", ["/"]],
    ["Inbox, Today, Archive", ["1", "2", "3"]],
    ["New note", ["N"]],
    ["Settings", [mod, ","]],
  ];
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Keyboard shortcuts"
      actions={<Button onClick={onClose}>Close</Button>}
    >
      <dl className="shortcuts">
        {rows.map(([label, keys]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              <Kbd keys={keys} />
            </dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
