import { memo, useEffect, useRef, useState } from "react";
import { Button, IconButton } from "../components/Button";
import { TextArea, TextField } from "../components/Controls";
import { Icon } from "../components/Icon";
import { timeLabel } from "../lib/dates";
import type { Note } from "../lib/types";

export interface NoteActions {
  select: (id: string) => void;
  toggleComplete: (note: Note) => void;
  archive: (note: Note) => void;
  restore: (note: Note) => void;
  remove: (note: Note) => void;
  copy: (note: Note) => void;
  startEdit: (id: string) => void;
  cancelEdit: () => void;
  saveEdit: (note: Note, content: string, category: string | null) => Promise<boolean>;
}

interface Props {
  note: Note;
  selected: boolean;
  editing: boolean;
  actions: NoteActions;
}

const LONG_LINES = 5;
const LONG_CHARS = 420;

function isLong(content: string) {
  return content.length > LONG_CHARS || content.split("\n").length > LONG_LINES;
}

export const NoteCard = memo(function NoteCard({ note, selected, editing, actions }: Props) {
  const [expanded, setExpanded] = useState(false);
  const ref = useRef<HTMLLIElement>(null);
  const long = isLong(note.content);
  const done = note.status === "completed";
  const inArchive = note.status !== "inbox";

  useEffect(() => {
    if (selected) ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [selected]);

  return (
    <li
      ref={ref}
      className="note"
      data-selected={selected}
      data-status={note.status}
      aria-current={selected || undefined}
      onClick={() => actions.select(note.id)}
    >
      <button
        type="button"
        role="checkbox"
        className="check"
        aria-checked={done}
        aria-label={done ? "Mark as not completed" : "Mark as completed"}
        title={done ? "Mark as not completed" : "Mark as completed"}
        onClick={(e) => {
          e.stopPropagation();
          actions.toggleComplete(note);
        }}
      >
        <Icon name="check" size={12} />
      </button>

      {editing ? (
        <NoteEditor note={note} actions={actions} />
      ) : (
        <>
          <div className="note__body">
            <p
              className="note__content selectable"
              data-clamped={long && !expanded}
              onDoubleClick={() => actions.startEdit(note.id)}
            >
              {note.content}
            </p>
            {long && (
              <button
                type="button"
                className="note__more"
                aria-expanded={expanded}
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded((v) => !v);
                }}
              >
                {expanded ? "Show less" : "Show more"}
              </button>
            )}
            <div className="note__meta">
              <time dateTime={new Date(note.created_at).toISOString()}>
                {timeLabel(note.created_at)}
              </time>
              {note.category && <span className="note__category">{note.category}</span>}
              {note.source && <span>from {note.source}</span>}
              {note.status === "archived" && <span>Archived</span>}
              {done && <span>Completed</span>}
            </div>
          </div>
          <div className="note__actions" onClick={(e) => e.stopPropagation()}>
            <IconButton icon="edit" label="Edit (E)" onClick={() => actions.startEdit(note.id)} />
            <IconButton icon="copy" label="Copy (C)" onClick={() => actions.copy(note)} />
            {inArchive ? (
              <IconButton
                icon="restore"
                label="Move back to Inbox (R)"
                onClick={() => actions.restore(note)}
              />
            ) : (
              <IconButton
                icon="archive"
                label="Archive (A)"
                onClick={() => actions.archive(note)}
              />
            )}
            <IconButton
              icon="trash"
              label="Delete (Delete)"
              danger
              onClick={() => actions.remove(note)}
            />
          </div>
        </>
      )}
    </li>
  );
});

function NoteEditor({ note, actions }: { note: Note; actions: NoteActions }) {
  const [content, setContent] = useState(note.content);
  const [category, setCategory] = useState(note.category ?? "");
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const empty = content.trim() === "";
  const save = async () => {
    if (empty || saving) return;
    setSaving(true);
    const ok = await actions.saveEdit(note, content, category.trim() || null);
    if (!ok) setSaving(false);
  };

  return (
    <div
      className="note__edit"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          actions.cancelEdit();
        } else if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          void save();
        }
      }}
    >
      <TextArea
        ref={ref}
        aria-label="Edit note"
        rows={Math.min(12, Math.max(2, content.split("\n").length))}
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <div className="note__edit-row">
        <TextField
          aria-label="Category (optional)"
          placeholder="Category"
          value={category}
          maxLength={40}
          onChange={(e) => setCategory(e.target.value)}
        />
        <span className="note__edit-hint">Enter saves, Shift+Enter adds a line</span>
        <Button variant="quiet" onClick={actions.cancelEdit}>
          Cancel
        </Button>
        <Button variant="primary" busy={saving} disabled={empty} onClick={() => void save()}>
          Save
        </Button>
      </div>
    </div>
  );
}
