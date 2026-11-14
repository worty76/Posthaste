//! Global keyboard shortcuts: registration, conflict reporting, fallback.

use posthaste_core::Settings;
use posthaste_platform::Session;
use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::windows;

#[derive(Debug, Clone, Default, Serialize)]
pub struct ShortcutStatus {
    pub accelerator: String,
    /// Whether the operating system accepted the registration.
    pub registered: bool,
    /// Why registration failed, in plain language.
    pub error: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct ShortcutReport {
    pub capture: ShortcutStatus,
    pub inbox: ShortcutStatus,
    /// Set when shortcuts register but cannot be relied on (Wayland).
    pub limitation: Option<String>,
}

const WAYLAND_NOTE: &str = "This is a Wayland session. Wayland does not let applications \
     register global shortcuts themselves, so the shortcut may only work while an X11 \
     (XWayland) window is focused. For a reliable shortcut, bind the command \
     \"posthaste --capture\" in your desktop's keyboard settings.";

#[derive(Clone, Copy)]
enum Action {
    Capture,
    Inbox,
}

fn register(app: &AppHandle, accelerator: &str, action: Action) -> ShortcutStatus {
    let mut status = ShortcutStatus {
        accelerator: accelerator.to_string(),
        registered: false,
        error: None,
    };
    if accelerator.trim().is_empty() {
        status.error = Some("No shortcut is set.".into());
        return status;
    }
    let shortcut: Shortcut = match accelerator.parse() {
        Ok(s) => s,
        Err(e) => {
            status.error = Some(format!("\"{accelerator}\" isn't a valid shortcut ({e})."));
            return status;
        }
    };
    let result = app
        .global_shortcut()
        .on_shortcut(shortcut, move |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                match action {
                    Action::Capture => windows::toggle_capture(app),
                    Action::Inbox => windows::show_main(app, Some("inbox")),
                }
            }
        });
    match result {
        Ok(()) => status.registered = true,
        Err(e) => {
            log::warn!("global shortcut {accelerator} not registered: {e}");
            status.error = Some(format!(
                "{accelerator} could not be registered. Another application is probably \
                 using it. Choose a different shortcut, or free it in the other application. \
                 (System message: {e})"
            ));
        }
    }
    status
}

/// Replaces every registered shortcut with the ones in `settings` and
/// reports, per shortcut, whether the OS accepted it.
pub fn apply(app: &AppHandle, settings: &Settings) -> ShortcutReport {
    if let Err(e) = app.global_shortcut().unregister_all() {
        log::warn!("could not clear global shortcuts: {e}");
    }
    let capture = register(app, &settings.capture_shortcut, Action::Capture);
    let inbox = if settings.inbox_shortcut.trim().is_empty() {
        ShortcutStatus::default()
    } else if same_shortcut(&settings.inbox_shortcut, &settings.capture_shortcut) {
        ShortcutStatus {
            accelerator: settings.inbox_shortcut.clone(),
            registered: false,
            error: Some("This is the same as the capture shortcut.".into()),
        }
    } else {
        register(app, &settings.inbox_shortcut, Action::Inbox)
    };
    ShortcutReport {
        capture,
        inbox,
        limitation: (posthaste_platform::session() == Session::Wayland)
            .then(|| WAYLAND_NOTE.to_string()),
    }
}

fn same_shortcut(a: &str, b: &str) -> bool {
    match (a.parse::<Shortcut>(), b.parse::<Shortcut>()) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}
