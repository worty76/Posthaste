import { useCallback, useEffect, useRef, useState } from "react";
import { Button, IconButton } from "./Button";

export interface Toast {
  id: number;
  text: string;
  kind: "info" | "error";
  action?: { label: string; run: () => void };
}

const INFO_MS = 5000;
const ERROR_MS = 9000;

/** Toast queue. Newer toasts replace older ones of the same kind of action. */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setToasts((all) => all.filter((x) => x.id !== id));
  }, []);

  const show = useCallback(
    (text: string, opts: { kind?: Toast["kind"]; action?: Toast["action"] } = {}) => {
      const id = nextId.current++;
      const kind = opts.kind ?? "info";
      // Keep at most two on screen so they never pile over the notes.
      setToasts((all) => [...all.slice(-1), { id, text, kind, action: opts.action }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), kind === "error" ? ERROR_MS : INFO_MS),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => clearTimeout(t));
  }, []);

  return { toasts, show, dismiss };
}

export function Toasts({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast${t.kind === "error" ? " toast--error" : ""}`}>
          <span className="toast__text">{t.text}</span>
          {t.action && (
            <Button
              onClick={() => {
                t.action?.run();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </Button>
          )}
          <IconButton icon="close" label="Dismiss" onClick={() => dismiss(t.id)} />
        </div>
      ))}
    </div>
  );
}
