import { useState } from "react";
import { Button } from "../components/Button";
import { Kbd } from "../components/Kbd";
import { acceleratorFromEvent, formatAccelerator } from "../lib/shortcut";
import type { Os } from "../lib/types";

interface Props {
  value: string;
  os: Os;
  label: string;
  onChange: (accelerator: string) => void;
}

/** Click, then press the combination to use. Escape cancels. */
export function ShortcutRecorder({ value, os, label, onChange }: Props) {
  const [recording, setRecording] = useState(false);

  return (
    <Button
      className="recorder"
      aria-label={recording ? `${label}: press the new shortcut` : `${label}: change`}
      data-recording={recording}
      onClick={() => setRecording(true)}
      onBlur={() => setRecording(false)}
      onKeyDown={(e) => {
        if (!recording) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "Escape") {
          setRecording(false);
          return;
        }
        const accelerator = acceleratorFromEvent(e.nativeEvent, os);
        if (accelerator) {
          setRecording(false);
          onChange(accelerator);
        }
      }}
    >
      {recording ? (
        "Press shortcut…"
      ) : value ? (
        <Kbd keys={formatAccelerator(value, os)} />
      ) : (
        "Set shortcut"
      )}
    </Button>
  );
}
