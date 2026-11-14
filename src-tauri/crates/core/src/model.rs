use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Inbox,
    Completed,
    Archived,
}

impl Status {
    pub fn as_str(self) -> &'static str {
        match self {
            Status::Inbox => "inbox",
            Status::Completed => "completed",
            Status::Archived => "archived",
        }
    }

    pub fn parse(s: &str) -> Option<Status> {
        match s {
            "inbox" => Some(Status::Inbox),
            "completed" => Some(Status::Completed),
            "archived" => Some(Status::Archived),
            _ => None,
        }
    }
}

/// A captured note. Timestamps are UTC milliseconds since the Unix epoch.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Note {
    pub id: String,
    pub content: String,
    pub status: Status,
    pub category: Option<String>,
    /// Name of the application that was in front when the note was captured.
    pub source: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub completed_at: Option<i64>,
    pub archived_at: Option<i64>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct NewNote {
    pub content: String,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub source: Option<String>,
}

/// Filter for listing notes. Results are always newest first.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct NoteQuery {
    /// Free-text search over content and category. Empty means no text filter.
    pub text: String,
    /// Statuses to include. Empty means all.
    pub statuses: Vec<Status>,
    /// Inclusive lower bound on `created_at`.
    pub created_from: Option<i64>,
    /// Exclusive upper bound on `created_at`.
    pub created_to: Option<i64>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Counts {
    pub inbox: i64,
    pub today: i64,
    pub archive: i64,
}

/// How many rows of each glance group are returned. The `done` and `total`
/// counts are computed over every matching note and are never capped.
pub const GLANCE_GROUP_LIMIT: i64 = 50;

/// What the Today window shows for one day: open notes carried over from
/// before it, notes that belong to it, and how many of them are done.
/// Carry-over is derived, never written: nothing here moves or rewrites notes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Glance {
    pub carried: Vec<Note>,
    pub today: Vec<Note>,
    pub done: i64,
    pub total: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Draft {
    pub content: String,
    pub category: Option<String>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CapturePosition {
    /// Centre of the active display.
    Center,
    /// Horizontally centred, in the upper third (launcher style).
    Upper,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EnterBehavior {
    /// Enter saves; Shift+Enter inserts a newline.
    Save,
    /// Enter inserts a newline; Cmd/Ctrl+Enter saves.
    Newline,
}

/// Which AI provider polishes notes, if any. Off by default: nothing is
/// sent anywhere until the user picks a provider and adds their own key.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum AiProvider {
    #[default]
    None,
    Anthropic,
    OpenAI,
    Gemini,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DraftRetention {
    Forever,
    Week,
    Day,
}

impl DraftRetention {
    pub fn max_age_ms(self) -> Option<i64> {
        const DAY: i64 = 24 * 60 * 60 * 1000;
        match self {
            DraftRetention::Forever => None,
            DraftRetention::Week => Some(7 * DAY),
            DraftRetention::Day => Some(DAY),
        }
    }
}

pub const DEFAULT_CAPTURE_SHORTCUT: &str = "CmdOrCtrl+Shift+Space";
pub const DEFAULT_INBOX_SHORTCUT: &str = if cfg!(target_os = "macos") {
    "Cmd+Ctrl+N"
} else {
    "Ctrl+Alt+N"
};

/// User preferences. Unknown or missing fields fall back to defaults, so
/// settings written by older or newer versions always load.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub theme: Theme,
    pub launch_at_login: bool,
    pub start_minimized: bool,
    pub capture_shortcut: String,
    pub inbox_shortcut: String,
    pub capture_position: CapturePosition,
    /// Hide the capture window after a successful save.
    pub hide_after_save: bool,
    /// Hide the capture window when it loses focus (the draft is kept).
    pub hide_on_blur: bool,
    pub enter_behavior: EnterBehavior,
    pub draft_retention: DraftRetention,
    /// The selected look. `None` is the Default look (system/light/dark);
    /// out of the box every install wears Ink.
    pub look_id: Option<String>,
    /// AI polish: the provider, the user's own API key, and the model
    /// (empty string = the provider's small default model).
    pub ai_provider: AiProvider,
    pub ai_api_key: String,
    pub ai_model: String,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            theme: Theme::System,
            launch_at_login: false,
            start_minimized: false,
            capture_shortcut: DEFAULT_CAPTURE_SHORTCUT.into(),
            inbox_shortcut: DEFAULT_INBOX_SHORTCUT.into(),
            capture_position: CapturePosition::Center,
            hide_after_save: true,
            hide_on_blur: true,
            enter_behavior: EnterBehavior::Save,
            draft_retention: DraftRetention::Forever,
            look_id: Some(crate::look::DEFAULT_LOOK_ID.into()),
            ai_provider: AiProvider::None,
            ai_api_key: String::new(),
            ai_model: String::new(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct ImportReport {
    pub imported: usize,
    pub skipped_existing: usize,
    pub skipped_invalid: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct DataInfo {
    pub path: String,
    pub size_bytes: u64,
    pub note_count: i64,
    pub schema_version: i64,
}
