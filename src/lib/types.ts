// Mirrors the serde types in src-tauri/crates/core/src/model.rs. Keep in step.

export type Status = "inbox" | "completed" | "archived";

/** Timestamps are UTC milliseconds since the Unix epoch. */
export interface Note {
  id: string;
  content: string;
  status: Status;
  category: string | null;
  source: string | null;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
  archived_at: number | null;
}

export interface NoteQuery {
  text?: string;
  statuses?: Status[];
  created_from?: number | null;
  created_to?: number | null;
  limit?: number;
  offset?: number;
}

export interface Counts {
  inbox: number;
  today: number;
  archive: number;
}

export interface Draft {
  content: string;
  category: string | null;
  updated_at: number;
}

export type Theme = "system" | "light" | "dark";
export type CapturePosition = "center" | "upper";
export type EnterBehavior = "save" | "newline";
export type DraftRetention = "forever" | "week" | "day";

export interface Settings {
  theme: Theme;
  launch_at_login: boolean;
  start_minimized: boolean;
  capture_shortcut: string;
  inbox_shortcut: string;
  capture_position: CapturePosition;
  hide_after_save: boolean;
  hide_on_blur: boolean;
  enter_behavior: EnterBehavior;
  draft_retention: DraftRetention;
  look_id: string | null;
}

// Mirrors the look types in src-tauri/crates/core/src/look/. Keep in step.

export type Base = "light" | "dark";
export type Shape = "sharp" | "soft" | "round";
export type FontFace = "system" | "rounded" | "serif" | "mono";

export interface LookColors {
  bg: string;
  surface: string;
  text: string;
  accent: string;
  bg_sunken?: string | null;
  surface_raised?: string | null;
  danger?: string | null;
  ok?: string | null;
}

export interface LookDoc {
  format: string;
  version: number;
  name: string;
  author?: string | null;
  base: Base;
  colors: LookColors;
  shape: Shape;
  font: FontFace;
}

export interface LookPreview {
  bg: string;
  surface: string;
  text: string;
  accent: string;
}

export interface LookSummary {
  id: string;
  name: string;
  author: string | null;
  builtin: boolean;
  base: Base;
  preview: LookPreview;
}

export interface ResolvedLook {
  id: string;
  name: string;
  author: string | null;
  base: Base;
  shape: Shape;
  font: FontFace;
  tokens: Record<string, string>;
}

export interface ShortcutStatus {
  accelerator: string;
  registered: boolean;
  error: string | null;
}

export interface ShortcutReport {
  capture: ShortcutStatus;
  inbox: ShortcutStatus;
  limitation: string | null;
}

export interface SettingsState {
  settings: Settings;
  shortcuts: ShortcutReport;
}

export interface AppError {
  code: string;
  message: string;
}

export type Os = "macos" | "windows" | "linux";

export interface AppInfo {
  version: string;
  os: Os;
  session: "macos" | "windows" | "x11" | "wayland" | "unknown";
  tray_available: boolean;
  startup_error: AppError | null;
}

export interface DataInfo {
  path: string;
  size_bytes: number;
  note_count: number;
  schema_version: number;
}

export interface ImportReport {
  imported: number;
  skipped_existing: number;
  skipped_invalid: number;
}

export type View = "inbox" | "today" | "archive" | "settings";

export const DEFAULT_CAPTURE_SHORTCUT = "CmdOrCtrl+Shift+Space";
export const defaultInboxShortcut = (os: Os) => (os === "macos" ? "Cmd+Ctrl+N" : "Ctrl+Alt+N");
