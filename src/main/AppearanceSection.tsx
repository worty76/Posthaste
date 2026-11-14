import { useCallback, useEffect, useState } from "react";
import { Button } from "../components/Button";
import { Segmented, TextArea } from "../components/Controls";
import { Dialog } from "../components/Dialog";
import { copyText } from "../lib/clipboard";
import { api, on, toAppError } from "../lib/ipc";
import type { LookDoc, LookSummary, ResolvedLook, Settings } from "../lib/types";
import { LookEditor } from "./LookEditor";
import { Swatch } from "./Swatch";

interface AppearanceSectionProps {
  settings: Settings;
  update: (patch: Partial<Settings>) => Promise<void>;
  notify: (text: string, kind?: "info" | "error") => void;
  onPreviewLook: (look: ResolvedLook | null) => void;
}

/** The starting document for "Make your own": the selected look, or the
    bundled look matching the current base for Default. */
const DEFAULT_START_DARK = "builtin:midnight-grape";
const DEFAULT_START_LIGHT = "builtin:strawberry-milk";

export function AppearanceSection({
  settings,
  update,
  notify,
  onPreviewLook,
}: AppearanceSectionProps) {
  const [looks, setLooks] = useState<LookSummary[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importCode, setImportCode] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LookSummary | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  /** The editor dialog opens from this; kept until the editor closes. */
  const [editor, setEditor] = useState<{ initial: LookDoc; editingId: string | null } | null>(null);

  const set = (patch: Partial<Settings>) =>
    update(patch).catch((e) => notify(toAppError(e).message, "error"));

  const reload = useCallback(() => {
    api.lookList().then(setLooks, () => undefined);
  }, []);

  useEffect(() => {
    void reload();
    return on("looks-changed", reload);
  }, [reload]);

  const selected = looks.find((l) => l.id === settings.look_id) ?? null;
  const editing = editor !== null;

  /** A preview belongs to the editor; picking a look ends it. */
  const select = (id: string | null) => {
    onPreviewLook(null);
    void set({ look_id: id });
  };

  /** Arrow keys walk the gallery like Segmented does. */
  const move = (delta: number) => {
    const ids: (string | null)[] = [null, ...looks.map((l) => l.id)];
    const i = ids.findIndex((id) => id === settings.look_id);
    const next = ids[(i + delta + ids.length) % ids.length] ?? null;
    select(next);
  };

  const share = async (look: LookSummary) => {
    try {
      const code = await api.lookExportCode(look.id);
      const ok = await copyText(code);
      if (!ok) notify("Could not copy to the clipboard", "error");
      else notify("Copied share code");
    } catch (e) {
      notify(toAppError(e).message, "error");
    }
  };

  const closeImport = () => {
    setImportOpen(false);
    setImportCode("");
    setImportError(null);
  };

  const runImport = async () => {
    setImportBusy(true);
    try {
      const summary = await api.lookImport(importCode);
      closeImport();
      void set({ look_id: summary.id });
      notify(`Added "${summary.name}"`);
    } catch (e) {
      // The dialog stays open with the code, so it can be fixed or retried.
      setImportError(toAppError(e).message);
    } finally {
      setImportBusy(false);
    }
  };

  const runDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await api.lookDelete(deleteTarget.id);
      setDeleteTarget(null);
    } catch (e) {
      notify(toAppError(e).message, "error");
    } finally {
      setDeleteBusy(false);
    }
  };

  const openEditor = async (look: LookSummary | null) => {
    const startId =
      look?.id ??
      (document.documentElement.dataset.theme === "dark"
        ? DEFAULT_START_DARK
        : DEFAULT_START_LIGHT);
    try {
      const doc = await api.lookDoc(startId);
      const initial = look && look.builtin ? { ...doc, name: copyName(doc.name) } : doc;
      setEditor({ initial, editingId: look && !look.builtin ? look.id : null });
    } catch (e) {
      notify(toAppError(e).message, "error");
    }
  };

  return (
    <>
      <div className="row">
        <div className="row__text">
          <div className="row__label">Appearance</div>
          <div className="row__help">
            Used by the Default look. Other looks are light or dark on their own.
          </div>
        </div>
        <div className="row__control">
          <Segmented
            label="Appearance"
            value={settings.theme}
            options={[
              { value: "system", label: "System" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
            onChange={(theme) => void set({ theme })}
          />
        </div>
      </div>
      <div className="row row--stack">
        <div
          className="looks"
          role="radiogroup"
          aria-label="Look"
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowDown") {
              e.preventDefault();
              move(1);
            } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
              e.preventDefault();
              move(-1);
            }
          }}
        >
          <button
            type="button"
            role="radio"
            className="look"
            aria-checked={settings.look_id === null}
            tabIndex={settings.look_id === null ? 0 : -1}
            onClick={() => select(null)}
          >
            <Swatch colors={null} />
            <span>Default</span>
          </button>
          {looks.map((look) => (
            <button
              key={look.id}
              type="button"
              role="radio"
              className="look"
              aria-checked={look.id === settings.look_id}
              tabIndex={look.id === settings.look_id ? 0 : -1}
              onClick={() => select(look.id)}
            >
              <Swatch colors={look.preview} />
              <span>{look.name}</span>
            </button>
          ))}
        </div>
        <div className="looks__actions">
          {selected && <Button onClick={() => void share(selected)}>Copy share code</Button>}
          {selected && !selected.builtin && (
            <>
              <Button disabled={editing} onClick={() => void openEditor(selected)}>
                Edit
              </Button>
              <Button variant="danger" disabled={editing} onClick={() => setDeleteTarget(selected)}>
                Delete
              </Button>
            </>
          )}
          {selected && selected.builtin && (
            <Button disabled={editing} onClick={() => void openEditor(selected)}>
              Make a copy
            </Button>
          )}
          <Button onClick={() => setImportOpen(true)}>Add from code…</Button>
          <Button disabled={editing} onClick={() => void openEditor(selected)}>
            Make your own…
          </Button>
        </div>
      </div>

      <Dialog
        open={importOpen}
        onClose={closeImport}
        title="Add from code"
        actions={
          <>
            <Button onClick={closeImport}>Cancel</Button>
            <Button
              variant="primary"
              busy={importBusy}
              disabled={importCode.trim() === ""}
              onClick={() => void runImport()}
            >
              Add look
            </Button>
          </>
        }
      >
        <p className="dialog__text">
          Paste a look code someone shared. It is checked before anything is applied.
        </p>
        <TextArea
          aria-label="Look code"
          value={importCode}
          onChange={(e) => {
            setImportCode(e.target.value);
            setImportError(null);
          }}
          rows={4}
          spellCheck={false}
        />
        {importError && (
          <p className="dialog__alert" role="alert">
            {importError}
          </p>
        )}
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={`Delete “${deleteTarget?.name ?? ""}”?`}
        actions={
          <>
            <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" busy={deleteBusy} onClick={() => void runDelete()}>
              Delete
            </Button>
          </>
        }
      >
        <p className="dialog__text">
          The look is removed from this computer. Copies you shared with others keep working.
        </p>
      </Dialog>

      {editor && (
        <LookEditor
          open
          initial={editor.initial}
          editingId={editor.editingId}
          onPreview={onPreviewLook}
          onClose={() => setEditor(null)}
          onSaved={(summary) => {
            void set({ look_id: summary.id });
            notify(`Saved "${summary.name}"`);
          }}
        />
      )}
    </>
  );
}

/** "Matcha copy", at most 40 characters like the look format requires. */
function copyName(name: string): string {
  return `${name} copy`.slice(0, 40);
}
