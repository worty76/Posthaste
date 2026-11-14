//! Commands the frontend can invoke. Each is a thin adapter: validation and
//! persistence live in `posthaste-core`, window behaviour in `windows`.

use std::sync::atomic::Ordering;

use posthaste_core::look::derive::ResolvedLook;
use posthaste_core::look::store::LookSummary;
use posthaste_core::look::{code::encode_code, derive::resolve, LookDoc};
use posthaste_core::{
    Counts, DataInfo, Draft, Glance, ImportReport, NewNote, Note, NoteQuery, Settings, Status,
};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::error::{AppError, AppResult};
use crate::shortcuts::{self, ShortcutReport};
use crate::state::{lock, AppState};
use crate::windows;

fn notes_changed(app: &AppHandle) {
    let _ = app.emit("notes-changed", ());
}

fn looks_changed(app: &AppHandle) {
    let _ = app.emit("looks-changed", ());
}

// ---- app ---------------------------------------------------------------------

#[derive(Serialize)]
pub struct AppInfo {
    version: String,
    /// "macos" | "windows" | "linux"
    os: &'static str,
    /// "macos" | "windows" | "x11" | "wayland" | "unknown"
    session: &'static str,
    tray_available: bool,
    /// Present when the database could not be opened at startup.
    startup_error: Option<AppError>,
}

#[tauri::command]
pub fn app_info(app: AppHandle, state: State<'_, AppState>) -> AppInfo {
    AppInfo {
        version: app.package_info().version.to_string(),
        os: std::env::consts::OS,
        session: posthaste_platform::session().as_str(),
        tray_available: state.tray_available.load(Ordering::Relaxed),
        startup_error: state.startup_error.clone(),
    }
}

// ---- capture -----------------------------------------------------------------

#[tauri::command]
pub fn capture_save(
    app: AppHandle,
    state: State<'_, AppState>,
    content: String,
    category: Option<String>,
    hide: bool,
) -> AppResult<Note> {
    let source = lock(&state.previous_app)
        .as_ref()
        .and_then(|p| p.name.clone());
    // Returns only after SQLite has committed; the window stays up on error
    // so the text is still there to retry.
    let note = state.with_db(|db| {
        db.capture_note(NewNote {
            content,
            category,
            source,
        })
    })?;
    notes_changed(&app);
    if hide {
        windows::hide_capture(&app, true);
    }
    Ok(note)
}

#[tauri::command]
pub fn capture_dismiss(app: AppHandle) {
    windows::hide_capture(&app, true);
}

#[tauri::command]
pub fn capture_open(app: AppHandle) {
    windows::show_capture(&app);
}

#[tauri::command]
pub fn draft_get(state: State<'_, AppState>) -> AppResult<Option<Draft>> {
    let retention = state.settings().draft_retention;
    state.with_db(|db| db.load_draft(retention))
}

#[tauri::command]
pub fn draft_set(
    state: State<'_, AppState>,
    content: String,
    category: Option<String>,
) -> AppResult<()> {
    state.with_db(|db| db.save_draft(&content, category.as_deref()))
}

#[tauri::command]
pub fn draft_clear(state: State<'_, AppState>) -> AppResult<()> {
    state.with_db(|db| db.clear_draft())
}

// ---- notes -------------------------------------------------------------------

#[tauri::command]
pub fn notes_list(state: State<'_, AppState>, query: NoteQuery) -> AppResult<Vec<Note>> {
    state.with_db(|db| db.list_notes(&query))
}

#[tauri::command]
pub fn notes_counts(
    state: State<'_, AppState>,
    today_from: i64,
    today_to: i64,
) -> AppResult<Counts> {
    state.with_db(|db| db.counts(today_from, today_to))
}

#[tauri::command]
pub fn categories_list(state: State<'_, AppState>) -> AppResult<Vec<String>> {
    state.with_db(|db| db.categories())
}

// ---- today --------------------------------------------------------------------

/// What the Today window shows. Bounds are the caller's local day, exactly
/// as `notes_counts` takes them.
#[tauri::command]
pub fn glance_get(state: State<'_, AppState>, today_from: i64, today_to: i64) -> AppResult<Glance> {
    state.with_db(|db| db.glance(today_from, today_to))
}

#[tauri::command]
pub fn today_dismiss(app: AppHandle) {
    windows::hide_today(&app, true);
}

#[tauri::command]
pub fn note_update(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    content: String,
    category: Option<String>,
) -> AppResult<Note> {
    let note = state.with_db(|db| db.update_note(&id, &content, category.as_deref()))?;
    notes_changed(&app);
    Ok(note)
}

#[tauri::command]
pub fn note_set_status(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    status: Status,
) -> AppResult<Note> {
    let note = state.with_db(|db| db.set_status(&id, status))?;
    notes_changed(&app);
    Ok(note)
}

#[tauri::command]
pub fn note_delete(app: AppHandle, state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.with_db(|db| db.trash_note(&id))?;
    notes_changed(&app);
    Ok(())
}

#[tauri::command]
pub fn note_undelete(app: AppHandle, state: State<'_, AppState>, id: String) -> AppResult<Note> {
    let note = state.with_db(|db| db.restore_trashed(&id))?;
    notes_changed(&app);
    Ok(note)
}

// ---- settings ----------------------------------------------------------------

#[derive(Serialize)]
pub struct SettingsState {
    settings: Settings,
    shortcuts: ShortcutReport,
}

#[tauri::command]
pub fn settings_get(app: AppHandle, state: State<'_, AppState>) -> SettingsState {
    let mut settings = state.settings();
    // The OS is the source of truth: the user may have removed the login
    // item themselves.
    if let Ok(enabled) = app.autolaunch().is_enabled() {
        settings.launch_at_login = enabled;
    }
    SettingsState {
        settings,
        shortcuts: lock(&state.shortcuts).clone(),
    }
}

#[tauri::command]
pub fn settings_update(
    app: AppHandle,
    state: State<'_, AppState>,
    settings: Settings,
) -> AppResult<SettingsState> {
    let old = state.settings();

    if settings.launch_at_login != app.autolaunch().is_enabled().unwrap_or(old.launch_at_login) {
        let result = if settings.launch_at_login {
            app.autolaunch().enable()
        } else {
            app.autolaunch().disable()
        };
        result.map_err(|e| {
            AppError::new(
                "autostart",
                format!("Launch at login could not be changed: {e}"),
            )
        })?;
    }

    let shortcuts_changed = settings.capture_shortcut != old.capture_shortcut
        || settings.inbox_shortcut != old.inbox_shortcut
        || settings.today_shortcut != old.today_shortcut;
    if shortcuts_changed {
        let report = shortcuts::apply(&app, &settings);
        let failed = [
            (&report.capture, &old.capture_shortcut),
            (&report.inbox, &old.inbox_shortcut),
            (&report.today, &old.today_shortcut),
        ]
        .into_iter()
        .find(|(s, previous)| {
            !s.registered && !s.accelerator.is_empty() && s.accelerator != **previous
        })
        .and_then(|(s, _)| s.error.clone());
        if let Some(message) = failed {
            // Put the working shortcuts back rather than leave the user
            // with none.
            *lock(&state.shortcuts) = shortcuts::apply(&app, &old);
            return Err(AppError::new("shortcut_unavailable", message));
        }
        *lock(&state.shortcuts) = report;
    }

    state.with_db(|db| db.save_settings(&settings))?;
    *state.settings.write().unwrap_or_else(|e| e.into_inner()) = settings.clone();
    let _ = app.emit("settings-changed", &settings);

    Ok(SettingsState {
        settings,
        shortcuts: lock(&state.shortcuts).clone(),
    })
}

// ---- data --------------------------------------------------------------------

#[tauri::command]
pub fn data_info(state: State<'_, AppState>) -> AppResult<DataInfo> {
    state.with_db(|db| db.info())
}

#[tauri::command]
pub fn data_reveal(app: AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    let path = state.with_db(|db| db.info())?.path;
    app.opener()
        .reveal_item_in_dir(&path)
        .map_err(|e| AppError::new("io", format!("The folder could not be opened: {e}")))
}

fn stamp() -> String {
    // UTC date for default file names; avoids pulling in a time-zone library.
    let days = posthaste_core::now_ms().div_euclid(86_400_000);
    let (y, m, d) = civil_from_days(days);
    format!("{y:04}-{m:02}-{d:02}")
}

/// Days since 1970-01-01 to (year, month, day). Howard Hinnant's algorithm.
fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (yoe + era * 400 + i64::from(m <= 2), m, d)
}

/// Asks where to save, then writes a JSON export. `None` means cancelled.
#[tauri::command]
pub async fn data_export(app: AppHandle, state: State<'_, AppState>) -> AppResult<Option<usize>> {
    let Some(dest) = app
        .dialog()
        .file()
        .set_title("Export notes")
        .set_file_name(format!("posthaste-export-{}.json", stamp()))
        .add_filter("JSON", &["json"])
        .blocking_save_file()
    else {
        return Ok(None);
    };
    let dest = dest
        .into_path()
        .map_err(|e| AppError::new("io", e.to_string()))?;
    state.with_db(|db| db.export_to(&dest)).map(Some)
}

#[tauri::command]
pub async fn data_import(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<Option<ImportReport>> {
    let Some(src) = app
        .dialog()
        .file()
        .set_title("Import notes")
        .add_filter("JSON", &["json"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let src = src
        .into_path()
        .map_err(|e| AppError::new("io", e.to_string()))?;
    let report = state.with_db(|db| db.import_from(&src))?;
    notes_changed(&app);
    Ok(Some(report))
}

/// Asks where to save, then writes a full copy of the database.
#[tauri::command]
pub async fn data_backup(app: AppHandle, state: State<'_, AppState>) -> AppResult<Option<String>> {
    let Some(dest) = app
        .dialog()
        .file()
        .set_title("Back up database")
        .set_file_name(format!("posthaste-backup-{}.db", stamp()))
        .add_filter("SQLite database", &["db"])
        .blocking_save_file()
    else {
        return Ok(None);
    };
    let dest = dest
        .into_path()
        .map_err(|e| AppError::new("io", e.to_string()))?;
    state.with_db(|db| db.backup_to(&dest))?;
    Ok(Some(dest.to_string_lossy().into_owned()))
}

/// Deletes all notes, drafts and settings. The frontend asks for explicit
/// confirmation first; `confirm` is a second guard against stray calls.
#[tauri::command]
pub fn data_clear(
    app: AppHandle,
    state: State<'_, AppState>,
    confirm: String,
) -> AppResult<SettingsState> {
    if confirm != "DELETE" {
        return Err(AppError::new(
            "not_confirmed",
            "Clearing data was not confirmed.",
        ));
    }
    state.with_db(|db| db.clear_all())?;
    log::warn!("all application data cleared at the user's request");
    notes_changed(&app);
    looks_changed(&app);
    // Settings are back to defaults; apply them like any other change.
    settings_update(app, state, Settings::default())
}

// ---- looks -------------------------------------------------------------------

#[tauri::command]
pub fn look_list(state: State<'_, AppState>) -> AppResult<Vec<LookSummary>> {
    state.with_db(|db| db.list_looks())
}

#[tauri::command]
pub fn look_active(state: State<'_, AppState>) -> AppResult<Option<ResolvedLook>> {
    state.with_db(|db| db.active_look())
}

#[tauri::command]
pub fn look_doc(state: State<'_, AppState>, id: String) -> AppResult<LookDoc> {
    state.with_db(|db| db.look_doc(&id))
}

/// Validates and derives a draft for the editor's live preview. Stores
/// nothing.
#[tauri::command]
pub fn look_preview(doc: LookDoc) -> AppResult<ResolvedLook> {
    Ok(resolve("preview", &doc)?)
}

#[tauri::command]
pub fn look_save(
    app: AppHandle,
    state: State<'_, AppState>,
    doc: LookDoc,
    id: Option<String>,
) -> AppResult<LookSummary> {
    let summary = state.with_db(|db| db.save_look(doc, id.as_deref()))?;
    looks_changed(&app);
    Ok(summary)
}

#[tauri::command]
pub fn look_import(
    app: AppHandle,
    state: State<'_, AppState>,
    code: String,
) -> AppResult<LookSummary> {
    let summary = state.with_db(|db| db.import_look(&code))?;
    looks_changed(&app);
    Ok(summary)
}

#[tauri::command]
pub fn look_export_code(state: State<'_, AppState>, id: String) -> AppResult<String> {
    let doc = state.with_db(|db| db.look_doc(&id))?;
    Ok(encode_code(&doc))
}

#[tauri::command]
pub fn look_delete(app: AppHandle, state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.with_db(|db| db.delete_look(&id))?;
    // Deleting the active look returns the app to Default immediately, the
    // same way data_clear resets settings.
    if state.settings().look_id.as_deref() == Some(id.as_str()) {
        let mut settings = state.settings();
        settings.look_id = None;
        settings_update(app.clone(), state, settings)?;
    }
    looks_changed(&app);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::civil_from_days;

    #[test]
    fn civil_dates() {
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        assert_eq!(civil_from_days(19_782), (2024, 2, 29));
        assert_eq!(civil_from_days(20_770), (2026, 11, 13));
    }
}
