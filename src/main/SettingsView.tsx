import { useEffect, useState, type ReactNode } from "react";
import { Button } from "../components/Button";
import { Segmented, Switch, TextField } from "../components/Controls";
import { Dialog } from "../components/Dialog";
import { api, toAppError } from "../lib/ipc";
import {
  DEFAULT_CAPTURE_SHORTCUT,
  defaultInboxShortcut,
  type AppInfo,
  type DataInfo,
  type ResolvedLook,
  type Settings,
  type SettingsState,
  type ShortcutReport,
  type ShortcutStatus,
  type UpdateInfo,
} from "../lib/types";
import { AppearanceSection } from "./AppearanceSection";
import { ShortcutRecorder } from "./ShortcutRecorder";

interface Props {
  info: AppInfo;
  settings: Settings;
  shortcuts: ShortcutReport;
  update: (patch: Partial<Settings>) => Promise<void>;
  accept: (state: SettingsState) => void;
  notify: (text: string, kind?: "info" | "error") => void;
  onPreviewLook: (look: ResolvedLook | null) => void;
  /** Shared with the banner in the note views; null until a check finds one. */
  updateAvailable: UpdateInfo | null;
  updating: boolean;
  onUpdate: () => void;
  onCheck: () => Promise<UpdateInfo | null>;
}

function Row({ label, help, children }: { label: string; help?: ReactNode; children: ReactNode }) {
  return (
    <div className="row">
      <div className="row__text">
        <div className="row__label">{label}</div>
        {help && <div className="row__help">{help}</div>}
      </div>
      <div className="row__control">{children}</div>
    </div>
  );
}

function RegistrationStatus({
  status,
  limitation,
}: {
  status: ShortcutStatus;
  limitation: string | null;
}) {
  if (!status.accelerator) return <p className="status">No shortcut set.</p>;
  if (!status.registered) {
    return (
      <p className="status selectable" data-state="error" role="alert">
        Not active. {status.error}
      </p>
    );
  }
  if (limitation) {
    return (
      <p className="status selectable" data-state="warn">
        Registered, with a limitation. {limitation}
      </p>
    );
  }
  return (
    <p className="status" data-state="ok">
      Registered and active.
    </p>
  );
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function SettingsView({
  info,
  settings,
  shortcuts,
  update,
  accept,
  notify,
  onPreviewLook,
  updateAvailable,
  updating,
  onUpdate,
  onCheck,
}: Props) {
  const [data, setData] = useState<DataInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [checkNotice, setCheckNotice] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const refreshData = () => api.dataInfo().then(setData, () => setData(null));
  useEffect(() => {
    void refreshData();
  }, []);

  /** Applies a change immediately; on failure the old value stays. */
  const set = (patch: Partial<Settings>) =>
    update(patch).catch((e) => notify(toAppError(e).message, "error"));

  const run = async (name: string, task: () => Promise<string | null>) => {
    setBusy(name);
    try {
      const message = await task();
      if (message) notify(message);
    } catch (e) {
      notify(toAppError(e).message, "error");
    } finally {
      setBusy(null);
      void refreshData();
    }
  };

  const closeClear = () => {
    setClearOpen(false);
    setConfirmText("");
  };

  const checkNow = async () => {
    setChecking(true);
    try {
      const found = await onCheck();
      setCheckNotice(found ? null : "You're on the latest version.");
    } catch (e) {
      notify(toAppError(e).message, "error");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="settings">
      <section className="settings__section" aria-labelledby="s-general">
        <h2 className="settings__heading" id="s-general">
          General
        </h2>
        <AppearanceSection
          settings={settings}
          update={update}
          notify={notify}
          onPreviewLook={onPreviewLook}
        />
        <Row
          label="Launch at login"
          help="Start Posthaste when you sign in, so the shortcut is always ready."
        >
          <Switch
            label="Launch at login"
            checked={settings.launch_at_login}
            onChange={(launch_at_login) => void set({ launch_at_login })}
          />
        </Row>
        <Row
          label="Start minimized"
          help={
            info.tray_available
              ? "Open in the background, without showing this window."
              : "Open in the background. No system tray was found, so launch Posthaste again to bring this window back."
          }
        >
          <Switch
            label="Start minimized"
            checked={settings.start_minimized}
            onChange={(start_minimized) => void set({ start_minimized })}
          />
        </Row>
      </section>

      <section className="settings__section" aria-labelledby="s-keyboard">
        <h2 className="settings__heading" id="s-keyboard">
          Keyboard
        </h2>
        <div className="row row--stack">
          <div className="row">
            <div className="row__text">
              <div className="row__label">Capture shortcut</div>
              <div className="row__help">Opens the Posthaste window from any application.</div>
            </div>
            <div className="row__control">
              <ShortcutRecorder
                label="Capture shortcut"
                value={settings.capture_shortcut}
                os={info.os}
                onChange={(capture_shortcut) => void set({ capture_shortcut })}
              />
              <Button
                variant="quiet"
                disabled={settings.capture_shortcut === DEFAULT_CAPTURE_SHORTCUT}
                onClick={() => void set({ capture_shortcut: DEFAULT_CAPTURE_SHORTCUT })}
              >
                Restore default
              </Button>
            </div>
          </div>
          <RegistrationStatus status={shortcuts.capture} limitation={shortcuts.limitation} />
        </div>
        <div className="row row--stack">
          <div className="row">
            <div className="row__text">
              <div className="row__label">Inbox shortcut</div>
              <div className="row__help">Opens this window on the Inbox.</div>
            </div>
            <div className="row__control">
              <ShortcutRecorder
                label="Inbox shortcut"
                value={settings.inbox_shortcut}
                os={info.os}
                onChange={(inbox_shortcut) => void set({ inbox_shortcut })}
              />
              <Button
                variant="quiet"
                disabled={settings.inbox_shortcut === defaultInboxShortcut(info.os)}
                onClick={() => void set({ inbox_shortcut: defaultInboxShortcut(info.os) })}
              >
                Restore default
              </Button>
            </div>
          </div>
          <RegistrationStatus status={shortcuts.inbox} limitation={shortcuts.limitation} />
        </div>
      </section>

      <section className="settings__section" aria-labelledby="s-capture">
        <h2 className="settings__heading" id="s-capture">
          Capture
        </h2>
        <Row
          label="Window position"
          help={
            info.session === "wayland"
              ? "On Wayland the compositor decides where windows appear, so this may have no effect."
              : "Where the Posthaste window appears on the display you're working on."
          }
        >
          <Segmented
            label="Window position"
            value={settings.capture_position}
            options={[
              { value: "center", label: "Center" },
              { value: "upper", label: "Upper third" },
            ]}
            onChange={(capture_position) => void set({ capture_position })}
          />
        </Row>
        <Row label="Enter key" help="The other action is always on Shift+Enter or Ctrl/⌘+Enter.">
          <Segmented
            label="Enter key"
            value={settings.enter_behavior}
            options={[
              { value: "save", label: "Saves" },
              { value: "newline", label: "Adds a line" },
            ]}
            onChange={(enter_behavior) => void set({ enter_behavior })}
          />
        </Row>
        <Row label="Close after saving" help="Turn off to capture several notes in a row.">
          <Switch
            label="Close after saving"
            checked={settings.hide_after_save}
            onChange={(hide_after_save) => void set({ hide_after_save })}
          />
        </Row>
        <Row
          label="Close when clicking elsewhere"
          help="What you typed is kept as a draft either way."
        >
          <Switch
            label="Close when clicking elsewhere"
            checked={settings.hide_on_blur}
            onChange={(hide_on_blur) => void set({ hide_on_blur })}
          />
        </Row>
        <Row label="Keep unsaved drafts" help="How long an unfinished note waits for you.">
          <Segmented
            label="Keep unsaved drafts"
            value={settings.draft_retention}
            options={[
              { value: "day", label: "1 day" },
              { value: "week", label: "7 days" },
              { value: "forever", label: "Until saved" },
            ]}
            onChange={(draft_retention) => void set({ draft_retention })}
          />
        </Row>
      </section>

      <section className="settings__section" aria-labelledby="s-ai">
        <h2 className="settings__heading" id="s-ai">
          AI polish
        </h2>
        <Row
          label="Provider"
          help="Off by default. Polishing sends the note text to the provider you choose, using your own API key. The key stays on this computer."
        >
          <Segmented
            label="AI provider"
            value={settings.ai_provider}
            options={[
              { value: "none", label: "Off" },
              { value: "anthropic", label: "Claude" },
              { value: "openai", label: "OpenAI" },
              { value: "gemini", label: "Gemini" },
            ]}
            onChange={(ai_provider) => void set({ ai_provider })}
          />
        </Row>
        {settings.ai_provider !== "none" && (
          <>
            <Row label="API key">
              <TextField
                type="password"
                aria-label="AI API key"
                value={settings.ai_api_key}
                placeholder="Paste your API key"
                onChange={(e) => void set({ ai_api_key: e.target.value })}
                spellCheck={false}
                autoComplete="off"
              />
            </Row>
            <Row label="Model" help="Leave empty to use the provider's small, fast default.">
              <TextField
                aria-label="AI model"
                value={settings.ai_model}
                placeholder={
                  settings.ai_provider === "anthropic"
                    ? "claude-haiku-4-5"
                    : settings.ai_provider === "openai"
                      ? "gpt-4o-mini"
                      : "gemini-2.0-flash"
                }
                onChange={(e) => void set({ ai_model: e.target.value })}
                spellCheck={false}
                autoComplete="off"
              />
            </Row>
          </>
        )}
      </section>

      <section className="settings__section" aria-labelledby="s-data">
        <h2 className="settings__heading" id="s-data">
          Data
        </h2>
        <div className="row row--stack">
          <div className="row__text">
            <div className="row__label">Database</div>
            <div className="row__help">
              Your notes live in one file on this computer and are never sent anywhere.
              {data && ` ${data.note_count} notes, ${formatBytes(data.size_bytes)}.`}
            </div>
          </div>
          <div className="path selectable">{data?.path ?? "Unavailable"}</div>
          <div className="row__control">
            <Button onClick={() => void run("reveal", () => api.dataReveal().then(() => null))}>
              Show in folder
            </Button>
          </div>
        </div>
        <Row label="Export notes" help="A readable JSON file with every note.">
          <Button
            busy={busy === "export"}
            onClick={() =>
              void run("export", async () => {
                const n = await api.dataExport();
                return n === null ? null : `Exported ${n} notes`;
              })
            }
          >
            Export…
          </Button>
        </Row>
        <Row
          label="Import notes"
          help="Adds notes from a Posthaste export. Existing notes are never overwritten."
        >
          <Button
            busy={busy === "import"}
            onClick={() =>
              void run("import", async () => {
                const r = await api.dataImport();
                if (!r) return null;
                const skipped = r.skipped_existing + r.skipped_invalid;
                return `Imported ${r.imported} notes${skipped ? `, skipped ${skipped}` : ""}`;
              })
            }
          >
            Import…
          </Button>
        </Row>
        <Row label="Back up database" help="A complete copy, including settings.">
          <Button
            busy={busy === "backup"}
            onClick={() =>
              void run("backup", async () => {
                const path = await api.dataBackup();
                return path ? "Backup created" : null;
              })
            }
          >
            Back up…
          </Button>
        </Row>
        <Row
          label="Clear all data"
          help="Deletes every note, draft, look and setting. This can't be undone."
        >
          <Button variant="danger" onClick={() => setClearOpen(true)}>
            Clear data…
          </Button>
        </Row>
      </section>

      <section className="settings__section" aria-labelledby="s-updates">
        <h2 className="settings__heading" id="s-updates">
          Updates
        </h2>
        <div className="row row--stack">
          <div className="row">
            <div className="row__text">
              <div className="row__label">Posthaste {info.version}</div>
              <div className="row__help">
                The app checks for updates at most every 6 hours. An update installs in place and
                Posthaste restarts.
              </div>
            </div>
            <div className="row__control">
              {updateAvailable ? (
                <Button busy={updating} onClick={onUpdate}>
                  Update to {updateAvailable.version}
                </Button>
              ) : (
                <Button busy={checking} onClick={() => void checkNow()}>
                  Check for updates
                </Button>
              )}
            </div>
          </div>
          {updateAvailable && (
            <p className="status" data-state="ok">
              Posthaste {updateAvailable.version} is ready to install.
            </p>
          )}
          {checkNotice && (
            <p className="status" data-state="ok">
              {checkNotice}
            </p>
          )}
        </div>
      </section>

      <Dialog
        open={clearOpen}
        onClose={closeClear}
        title="Delete all notes?"
        actions={
          <>
            <Button onClick={closeClear}>Cancel</Button>
            <Button
              variant="danger"
              busy={busy === "clear"}
              disabled={confirmText !== "DELETE"}
              onClick={() =>
                void run("clear", async () => {
                  accept(await api.dataClear());
                  closeClear();
                  return "All data cleared";
                })
              }
            >
              Delete everything
            </Button>
          </>
        }
      >
        <p className="dialog__text">
          This permanently deletes every note, the current draft, your looks and your settings from
          this computer. Export or back up first if you might want them again.
        </p>
        <TextField
          aria-label="Type DELETE to confirm"
          placeholder="Type DELETE to confirm"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </Dialog>
    </div>
  );
}
