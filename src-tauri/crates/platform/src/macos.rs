use objc2_app_kit::{NSApplicationActivationOptions, NSRunningApplication, NSWorkspace};

use crate::Session;

/// Process id of the previously frontmost application.
pub type Handle = i32;

pub fn session() -> Session {
    Session::MacOs
}

pub fn foreground() -> Option<(Handle, Option<String>)> {
    let app = NSWorkspace::sharedWorkspace().frontmostApplication()?;
    let pid = app.processIdentifier();
    if pid == std::process::id() as i32 {
        return None;
    }
    let name = app.localizedName().map(|n| n.to_string());
    Some((pid, name))
}

pub fn activate(pid: &Handle) -> bool {
    match NSRunningApplication::runningApplicationWithProcessIdentifier(*pid) {
        Some(app) => app.activateWithOptions(NSApplicationActivationOptions(0)),
        None => false,
    }
}
