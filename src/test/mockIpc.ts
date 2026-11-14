// A stand-in for src/lib/ipc.ts. Tests set what commands return and fire
// native events with `emit`.

import { vi } from "vitest";
import type { Note, Settings, SettingsState } from "../lib/types";

export const defaultSettings: Settings = {
  theme: "system",
  launch_at_login: false,
  start_minimized: false,
  capture_shortcut: "CmdOrCtrl+Shift+Space",
  inbox_shortcut: "Ctrl+Alt+N",
  capture_position: "center",
  hide_after_save: true,
  hide_on_blur: true,
  enter_behavior: "save",
  draft_retention: "forever",
  look_id: "builtin:ink",
  ai_provider: "none",
  ai_api_key: "",
  ai_model: "",
};

export function settingsState(patch: Partial<Settings> = {}): SettingsState {
  return {
    settings: { ...defaultSettings, ...patch },
    shortcuts: {
      capture: { accelerator: "CmdOrCtrl+Shift+Space", registered: true, error: null },
      inbox: { accelerator: "Ctrl+Alt+N", registered: true, error: null },
      limitation: null,
    },
  };
}

let seq = 0;
export function note(content: string, patch: Partial<Note> = {}): Note {
  seq += 1;
  return {
    id: `note-${seq}`,
    content,
    status: "inbox",
    category: null,
    source: null,
    created_at: Date.now() - seq * 1000,
    updated_at: Date.now(),
    completed_at: null,
    archived_at: null,
    ...patch,
  };
}

const handlers = new Map<string, Set<(payload: unknown) => void>>();

export function emit(name: string, payload: unknown = null) {
  handlers.get(name)?.forEach((h) => h(payload));
}

export const api = {
  appInfo: vi.fn(),
  captureSave: vi.fn(),
  captureDismiss: vi.fn(),
  captureOpen: vi.fn(),
  draftGet: vi.fn(),
  draftSet: vi.fn(),
  draftClear: vi.fn(),
  notesList: vi.fn(),
  notesCounts: vi.fn(),
  categoriesList: vi.fn(),
  noteUpdate: vi.fn(),
  noteSetStatus: vi.fn(),
  noteDelete: vi.fn(),
  noteUndelete: vi.fn(),
  settingsGet: vi.fn(),
  settingsUpdate: vi.fn(),
  dataInfo: vi.fn(),
  dataReveal: vi.fn(),
  dataExport: vi.fn(),
  dataImport: vi.fn(),
  dataBackup: vi.fn(),
  dataClear: vi.fn(),
  lookList: vi.fn(),
  lookActive: vi.fn(),
  lookDoc: vi.fn(),
  lookPreview: vi.fn(),
  lookSave: vi.fn(),
  lookImport: vi.fn(),
  lookExportCode: vi.fn(),
  lookDelete: vi.fn(),
  aiPolish: vi.fn(),
  checkForUpdate: vi.fn(),
  installUpdate: vi.fn(),
};

/** Resets every command to a harmless default. Call in `beforeEach`. */
export function resetIpc() {
  handlers.clear();
  Object.values(api).forEach((fn) => fn.mockReset().mockResolvedValue(undefined));
  api.settingsGet.mockResolvedValue(settingsState());
  api.settingsUpdate.mockImplementation(async (s: Settings) => settingsState(s));
  api.draftGet.mockResolvedValue(null);
  api.notesList.mockResolvedValue([]);
  api.notesCounts.mockResolvedValue({ inbox: 0, today: 0, archive: 0 });
  api.categoriesList.mockResolvedValue([]);
  api.dataInfo.mockResolvedValue({
    path: "/data/posthaste.db",
    size_bytes: 4096,
    note_count: 0,
    schema_version: 2,
  });
  api.lookList.mockResolvedValue([]);
  api.lookActive.mockResolvedValue(null);
  api.checkForUpdate.mockResolvedValue(null);
}

export const ipcMock = {
  api,
  on: (name: string, handler: (payload: unknown) => void) => {
    if (!handlers.has(name)) handlers.set(name, new Set());
    handlers.get(name)!.add(handler);
    return () => handlers.get(name)?.delete(handler);
  },
  toAppError: (e: unknown) =>
    e && typeof e === "object" && "message" in e
      ? { code: "test", message: String((e as { message: unknown }).message) }
      : { code: "unknown", message: "Something went wrong." },
};
