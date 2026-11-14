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
    pub today: ShortcutStatus,
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
    Today,
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
                    Action::Today => windows::toggle_today(app),
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
    let capture_taken = [(settings.capture_shortcut.as_str(), "capture")];
    let inbox = register_next(app, &settings.inbox_shortcut, &capture_taken, Action::Inbox);
    let inbox_taken = [
        (settings.capture_shortcut.as_str(), "capture"),
        (settings.inbox_shortcut.as_str(), "inbox"),
    ];
    let today = register_next(app, &settings.today_shortcut, &inbox_taken, Action::Today);
    ShortcutReport {
        capture,
        inbox,
        today,
        limitation: (posthaste_platform::session() == Session::Wayland)
            .then(|| WAYLAND_NOTE.to_string()),
    }
}

/// Registers one shortcut unless it repeats an earlier one, which is
/// reported instead: two actions on one accelerator would fight each other.
fn register_next(
    app: &AppHandle,
    accelerator: &str,
    earlier: &[(&str, &str)],
    action: Action,
) -> ShortcutStatus {
    if accelerator.trim().is_empty() {
        return ShortcutStatus::default();
    }
    let accelerators: Vec<&str> = earlier.iter().map(|(acc, _)| *acc).collect();
    if let Some(index) = repeats(&accelerators, accelerator) {
        let name = earlier[index].1;
        return ShortcutStatus {
            accelerator: accelerator.to_string(),
            registered: false,
            error: Some(format!("This is the same as the {name} shortcut.")),
        };
    }
    register(app, accelerator, action)
}

fn same_shortcut(a: &str, b: &str) -> bool {
    match (a.parse::<Shortcut>(), b.parse::<Shortcut>()) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}

/// Index of the first shortcut in `earlier` that is the same accelerator as
/// `candidate`, ignoring case and modifier order. `None` when they differ or
/// either does not parse: an unparseable string is not "the same shortcut",
/// its own registration error already says so.
fn repeats(earlier: &[&str], candidate: &str) -> Option<usize> {
    earlier.iter().position(|a| same_shortcut(a, candidate))
}

#[cfg(test)]
mod tests {
    use super::{repeats, same_shortcut};

    #[test]
    fn identical_accelerators_are_the_same_shortcut() {
        assert!(same_shortcut("Ctrl+Alt+G", "alt+ctrl+g"));
        assert!(!same_shortcut("Ctrl+Alt+G", "Ctrl+Alt+H"));
        assert!(!same_shortcut("Ctrl+Alt+G", "not even parseable"));
    }

    #[test]
    fn a_later_shortcut_that_repeats_an_earlier_one_is_reported() {
        let earlier = ["Ctrl+Alt+G", "Ctrl+Alt+N"];
        assert_eq!(repeats(&earlier, "alt+ctrl+g"), Some(0));
        assert_eq!(repeats(&earlier, "Ctrl+Alt+N"), Some(1));
        assert_eq!(repeats(&earlier, "Ctrl+Alt+H"), None);
        assert_eq!(repeats(&earlier, "not even parseable"), None);
    }
}
