//! Posthaste desktop shell: wires storage, windows, shortcuts and the tray
//! together. Business rules live in `posthaste-core`.

mod commands;
mod error;
mod shortcuts;
mod state;
mod tray;
mod windows;

use std::sync::atomic::Ordering;

use posthaste_core::Db;
use tauri::{AppHandle, Manager};
use tauri_plugin_autostart::MacosLauncher;

use crate::error::AppError;
use crate::state::{lock, AppState};

/// Notes stay recoverable in the trash for this long.
const TRASH_RETENTION_MS: i64 = 24 * 60 * 60 * 1000;

/// What a launch (or a second launch forwarded to the running instance)
/// asked for on the command line.
#[derive(Debug, PartialEq, Eq)]
enum Launch {
    Main,
    Capture,
    View(&'static str),
    Background,
}

fn parse_launch(args: &[String]) -> Launch {
    let has = |flag: &str| args.iter().any(|a| a == flag);
    if has("--capture") {
        Launch::Capture
    } else if has("--inbox") {
        Launch::View("inbox")
    } else if has("--settings") {
        Launch::View("settings")
    } else if has("--autostart") || has("--minimized") {
        Launch::Background
    } else {
        Launch::Main
    }
}

fn perform(app: &AppHandle, launch: Launch) {
    match launch {
        Launch::Main => windows::show_main(app, None),
        Launch::Capture => windows::show_capture(app),
        Launch::View(view) => windows::show_main(app, Some(view)),
        Launch::Background => {}
    }
}

fn open_database(app: &AppHandle) -> Result<Db, AppError> {
    let dir = app.path().app_data_dir().map_err(|e| {
        AppError::new(
            "db_open",
            format!("The application data folder could not be determined: {e}"),
        )
    })?;
    let mut db = Db::open(&dir.join("posthaste.db"))?;
    let cutoff = posthaste_core::now_ms() - TRASH_RETENTION_MS;
    match db.purge_trashed(cutoff) {
        Ok(0) => {}
        Ok(n) => log::info!("emptied {n} old note(s) from the trash"),
        Err(e) => log::warn!("trash could not be emptied: {e}"),
    }
    Ok(db)
}

pub fn run() {
    let app = tauri::Builder::default()
        // Must be first: a second launch hands its arguments to the running
        // instance and exits, so there is never more than one writer.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let launch = match parse_launch(&args) {
                // Launching the app again always surfaces something.
                Launch::Background => Launch::Main,
                other => other,
            };
            perform(app, launch);
        }))
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::capture_save,
            commands::capture_dismiss,
            commands::capture_open,
            commands::draft_get,
            commands::draft_set,
            commands::draft_clear,
            commands::notes_list,
            commands::notes_counts,
            commands::categories_list,
            commands::note_update,
            commands::note_set_status,
            commands::note_delete,
            commands::note_undelete,
            commands::settings_get,
            commands::settings_update,
            commands::data_info,
            commands::data_reveal,
            commands::data_export,
            commands::data_import,
            commands::data_backup,
            commands::data_clear,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            let db = open_database(&handle);
            let db_failed = db.is_err();
            app.manage(AppState::new(db));
            let state = handle.state::<AppState>();
            let settings = state.settings();

            windows::create(&handle)?;

            match tray::create(&handle) {
                Ok(()) => state.tray_available.store(true, Ordering::Relaxed),
                Err(e) => log::warn!("system tray unavailable, continuing without it: {e}"),
            }

            let report = shortcuts::apply(&handle, &settings);
            let shortcut_failed = !report.capture.registered;
            *lock(&state.shortcuts) = report;

            let args: Vec<String> = std::env::args().collect();
            let launch = match parse_launch(&args) {
                Launch::Main if settings.start_minimized => Launch::Background,
                other => other,
            };
            // Problems the user has to know about override "start minimized":
            // a silent launch with a dead shortcut would look like it works.
            if launch == Launch::Background && (db_failed || shortcut_failed) {
                windows::show_main(&handle, None);
            } else {
                perform(&handle, launch);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Posthaste could not start");

    app.run(|app, event| {
        // Clicking the Dock icon while no window is open brings the inbox back.
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = event {
            windows::show_main(app, None);
        }
        #[cfg(not(target_os = "macos"))]
        let _ = (app, event);
    });
}

#[cfg(test)]
mod tests {
    use super::{parse_launch, Launch};

    fn args(a: &[&str]) -> Vec<String> {
        a.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn launch_flags() {
        assert_eq!(parse_launch(&args(&["posthaste"])), Launch::Main);
        assert_eq!(
            parse_launch(&args(&["posthaste", "--capture"])),
            Launch::Capture
        );
        assert_eq!(
            parse_launch(&args(&["posthaste", "--inbox"])),
            Launch::View("inbox")
        );
        assert_eq!(
            parse_launch(&args(&["posthaste", "--settings"])),
            Launch::View("settings")
        );
        assert_eq!(
            parse_launch(&args(&["posthaste", "--autostart"])),
            Launch::Background
        );
    }
}
