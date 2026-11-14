import { useEffect, useRef, useState } from "react";
import { Button } from "../components/Button";
import { Segmented, TextField } from "../components/Controls";
import { Dialog } from "../components/Dialog";
import { api, toAppError } from "../lib/ipc";
import type { LookDoc, LookSummary, ResolvedLook } from "../lib/types";

/** How long typing pauses before the draft goes to Rust for a preview. */
const PREVIEW_DEBOUNCE_MS = 120;

interface LookEditorProps {
  open: boolean;
  /** Starting point. For "Edit" this is the look's own doc and `editingId`
      is its id; otherwise a copy. */
  initial: LookDoc;
  editingId: string | null;
  onPreview: (look: ResolvedLook | null) => void;
  onClose: () => void;
  onSaved: (summary: LookSummary) => void;
}

/** The native picker only takes full hex; while the text field is
    half-typed, hand it whatever there is and let the browser sanitise it.
    This is input plumbing, not validation — Rust still checks everything
    before a look can be saved or shown. */
function pickerValue(value: string): string {
  const hex = value.trim().toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(hex);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  return hex;
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <div className="look-editor__color">
      <TextField
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
      <input
        type="color"
        aria-label={`${label} picker`}
        value={pickerValue(value)}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function LookEditor({
  open,
  initial,
  editingId,
  onPreview,
  onClose,
  onSaved,
}: LookEditorProps) {
  const [doc, setDoc] = useState<LookDoc>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A newly opened editor starts from its document, discarding any edits
  // from the previous session.
  useEffect(() => {
    setDoc(initial);
    setError(null);
  }, [initial]);

  const patch = (changes: Partial<LookDoc>) => setDoc((d) => ({ ...d, ...changes }));
  const patchColor = (field: keyof LookDoc["colors"], value: string) =>
    setDoc((d) => ({ ...d, colors: { ...d.colors, [field]: value } }));

  // Every pause in typing sends the draft to Rust; its verdict decides
  // between a live preview and a disabled Save.
  useEffect(() => {
    if (!open) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      api
        .lookPreview(doc)
        .then((resolved) => {
          setError(null);
          onPreview(resolved ?? null);
        })
        .catch((e) => {
          setError(toAppError(e).message);
          onPreview(null);
        });
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [doc, open, onPreview]);

  const close = () => {
    onPreview(null);
    onClose();
  };

  const save = async () => {
    setBusy(true);
    try {
      const summary = await api.lookSave(doc, editingId);
      onSaved(summary);
      close();
    } catch (e) {
      setError(toAppError(e).message);
      setBusy(false);
    }
  };

  const canSave = error === null && doc.name.trim() !== "" && !busy;

  return (
    <Dialog
      open={open}
      onClose={close}
      title={editingId ? "Edit look" : "New look"}
      actions={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" busy={busy} disabled={!canSave} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <div className="look-editor">
        <TextField
          aria-label="Name"
          value={doc.name}
          maxLength={40}
          onChange={(e) => patch({ name: e.target.value })}
        />
        <Segmented
          label="Base"
          value={doc.base}
          options={[
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
          onChange={(base) => patch({ base })}
        />
        <div className="look-editor__colors">
          <ColorRow
            label="Background"
            value={doc.colors.bg}
            onChange={(v) => patchColor("bg", v)}
          />
          <ColorRow
            label="Surface"
            value={doc.colors.surface}
            onChange={(v) => patchColor("surface", v)}
          />
          <ColorRow label="Text" value={doc.colors.text} onChange={(v) => patchColor("text", v)} />
          <ColorRow
            label="Accent"
            value={doc.colors.accent}
            onChange={(v) => patchColor("accent", v)}
          />
        </div>
        <Segmented
          label="Corner shape"
          value={doc.shape}
          options={[
            { value: "sharp", label: "Sharp" },
            { value: "soft", label: "Soft" },
            { value: "round", label: "Round" },
          ]}
          onChange={(shape) => patch({ shape })}
        />
        <Segmented
          label="Font"
          value={doc.font}
          options={[
            { value: "system", label: "System" },
            { value: "rounded", label: "Rounded" },
            { value: "serif", label: "Serif" },
            { value: "mono", label: "Mono" },
          ]}
          onChange={(font) => patch({ font })}
        />
        {error ? (
          <p className="dialog__alert" role="alert">
            {error}
          </p>
        ) : (
          <p className="dialog__status" role="status">
            Looks good
          </p>
        )}
      </div>
    </Dialog>
  );
}
