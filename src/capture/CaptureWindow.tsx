import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Kbd } from "../components/Kbd";
import { useAppearance } from "../hooks/useAppearance";
import { useSettings } from "../hooks/useSettings";
import { DraftSync } from "../lib/draftSync";
import { api, on, toAppError } from "../lib/ipc";
import { formatAccelerator, hasMod } from "../lib/shortcut";
import type { Os } from "../lib/types";

type StatusKind = "idle" | "restored" | "saving" | "saved" | "error" | "empty";

interface Status {
  kind: StatusKind;
  text: string;
}

const IDLE: Status = { kind: "idle", text: "" };

export function CaptureWindow({ os }: { os: Os }) {
  const { settings, shortcuts } = useSettings();
  useAppearance(settings);

  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>(IDLE);
  const [source, setSource] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const saving = useRef(false);
  /** Whether the user has typed since the window was last shown. */
  const touched = useRef(false);

  const drafts = useMemo(
    () =>
      new DraftSync(
        (c, cat) => api.draftSet(c, cat),
        (e) => setStatus({ kind: "error", text: `Draft not saved: ${toAppError(e).message}` }),
      ),
    [],
  );

  const restoreDraft = useCallback(async () => {
    try {
      const draft = await api.draftGet();
      // Never overwrite what the user has started typing meanwhile.
      if (!draft || touched.current) return;
      setContent(draft.content);
      setCategory(draft.category ?? "");
      setStatus({ kind: "restored", text: "Draft restored" });
    } catch (e) {
      setStatus({ kind: "error", text: toAppError(e).message });
    }
  }, []);

  useEffect(() => {
    void restoreDraft();
    inputRef.current?.focus();
  }, [restoreDraft]);

  useEffect(
    () =>
      on("capture-shown", (payload) => {
        touched.current = false;
        setSource(payload.source);
        // Replay the entrance animation without remounting (which would
        // drop focus): clear it, force a style flush, let CSS reapply it.
        const panel = panelRef.current;
        if (panel) {
          panel.style.animation = "none";
          void panel.offsetWidth;
          panel.style.animation = "";
        }
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
        if (el.value.trim() === "") {
          setStatus(IDLE);
          void restoreDraft();
        } else {
          // Text left from last time: say so, and offer the way out.
          setStatus((s) => (s.kind === "error" ? s : { kind: "restored", text: "Draft restored" }));
        }
        void api.categoriesList().then(setCategories, () => undefined);
      }),
    [restoreDraft],
  );

  // If the window is hidden by anything other than our own keys (focus
  // loss, the shortcut again, the OS), make sure the text is on disk.
  useEffect(() => on("capture-hidden", () => void drafts.flush()), [drafts]);
  useEffect(() => {
    const flush = () => void drafts.flush();
    window.addEventListener("blur", flush);
    return () => window.removeEventListener("blur", flush);
  }, [drafts]);

  const edit = (nextContent: string, nextCategory: string) => {
    touched.current = true;
    setContent(nextContent);
    setCategory(nextCategory);
    drafts.schedule(nextContent, nextCategory || null);
    if (status.kind !== "idle" && status.kind !== "saving") setStatus(IDLE);
  };

  const save = async (hide: boolean) => {
    if (saving.current) return;
    if (content.trim() === "") {
      setStatus({ kind: "empty", text: "Nothing to save yet" });
      setShake(true);
      return;
    }
    saving.current = true;
    setStatus({ kind: "saving", text: "Saving…" });
    try {
      // Make sure no draft write can land after the note is saved.
      await drafts.cancel();
      await api.captureSave(content, category.trim() || null, hide);
      // Only now, with the note committed, is the text let go.
      touched.current = false;
      setContent("");
      setCategory("");
      setStatus(hide ? IDLE : { kind: "saved", text: "Saved" });
      if (!hide) inputRef.current?.focus();
    } catch (e) {
      setStatus({ kind: "error", text: `Not saved: ${toAppError(e).message}` });
      // Keep the text safe as a draft while the user decides what to do.
      drafts.schedule(content, category || null);
    } finally {
      saving.current = false;
    }
  };

  const dismiss = async () => {
    await drafts.flush();
    await api.captureDismiss().catch(() => undefined);
  };

  const discard = async () => {
    await drafts.cancel();
    touched.current = false;
    setContent("");
    setCategory("");
    setStatus(IDLE);
    await api.draftClear().catch(() => undefined);
    inputRef.current?.focus();
  };

  const enterSaves = (settings?.enter_behavior ?? "save") === "save";
  const hideAfterSave = settings?.hide_after_save ?? true;

  const onKeyDown = (e: KeyboardEvent) => {
    // Enter while composing (IME, Telex, dead keys) confirms the composition.
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Escape") {
      e.preventDefault();
      void dismiss();
      return;
    }
    if (e.key !== "Enter") return;
    const mod = hasMod(e, os);
    if (enterSaves) {
      if (e.shiftKey && !mod) return; // newline
      e.preventDefault();
      // Enter: save and close. Mod+Enter: save and stay for another note.
      void save(mod ? false : hideAfterSave);
    } else if (mod) {
      e.preventDefault();
      void save(hideAfterSave);
    }
  };

  const mod = os === "macos" ? "⌘" : "Ctrl";
  const hints = enterSaves
    ? [
        { keys: ["↵"], label: "save" },
        { keys: ["⇧", "↵"], label: "new line", extra: true },
        { keys: ["esc"], label: "close" },
      ]
    : [
        { keys: [mod, "↵"], label: "save" },
        { keys: ["↵"], label: "new line", extra: true },
        { keys: ["esc"], label: "close" },
      ];

  const accelerator = shortcuts?.capture.registered ? shortcuts.capture.accelerator : "";

  return (
    <div className="capture" onKeyDown={onKeyDown}>
      <section
        ref={panelRef}
        className="capture__panel"
        aria-label="Quick Note"
        data-shake={shake}
        onAnimationEnd={() => setShake(false)}
      >
        <header className="capture__header" data-tauri-drag-region>
          <span className="capture__mark" aria-hidden="true" />
          <span className="capture__title">Quick Note</span>
          {source && <span className="capture__source">from {source}</span>}
          <span className="capture__spacer" />
          {accelerator && <Kbd keys={formatAccelerator(accelerator, os)} />}
        </header>

        <textarea
          ref={inputRef}
          className="capture__input"
          aria-label="Note"
          placeholder="What's on your mind?"
          value={content}
          onChange={(e) => edit(e.target.value, category)}
          autoFocus
          spellCheck
        />

        <footer className="capture__footer">
          <input
            className="capture__category"
            aria-label="Category (optional)"
            placeholder="# category"
            list="capture-categories"
            value={category}
            maxLength={40}
            onChange={(e) => edit(content, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                e.stopPropagation();
                inputRef.current?.focus();
              }
            }}
          />
          <datalist id="capture-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>

          <span
            className="capture__status"
            data-kind={status.kind}
            role={status.kind === "error" ? "alert" : "status"}
          >
            {status.text}
            {status.kind === "restored" && (
              <button type="button" className="capture__link" onClick={() => void discard()}>
                Discard
              </button>
            )}
          </span>

          <span className="capture__hints" aria-hidden="true">
            {hints.map((h) => (
              <span
                key={h.label}
                className={`capture__hint${h.extra ? " capture__hint--extra" : ""}`}
              >
                <Kbd keys={h.keys} />
                {h.label}
              </span>
            ))}
          </span>
        </footer>
      </section>
    </div>
  );
}
