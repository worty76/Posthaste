//! Remembering which application was in front before the capture window
//! appeared, and handing focus back to it afterwards.
//!
//! Each OS exposes this differently, and Wayland deliberately does not expose
//! it at all; see [`Session`].

#[cfg(target_os = "linux")]
#[path = "linux.rs"]
mod imp;
#[cfg(target_os = "macos")]
#[path = "macos.rs"]
mod imp;
#[cfg(windows)]
#[path = "windows.rs"]
mod imp;
#[cfg(not(any(target_os = "linux", target_os = "macos", windows)))]
#[path = "unsupported.rs"]
mod imp;

/// The application that had focus when capture was triggered.
#[derive(Debug, Clone)]
pub struct PreviousApp {
    /// Human-readable application name, when the OS provides one. Never a
    /// window title: titles routinely contain private text.
    pub name: Option<String>,
    handle: imp::Handle,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Session {
    MacOs,
    Windows,
    X11,
    /// Wayland clients cannot see or activate other applications' windows.
    /// The compositor returns focus to the previous window by itself when
    /// ours is hidden, so nothing is lost; we just cannot influence it.
    Wayland,
    Unknown,
}

impl Session {
    pub fn as_str(self) -> &'static str {
        match self {
            Session::MacOs => "macos",
            Session::Windows => "windows",
            Session::X11 => "x11",
            Session::Wayland => "wayland",
            Session::Unknown => "unknown",
        }
    }
}

pub fn session() -> Session {
    imp::session()
}

/// Returns the currently focused application, or `None` when it is Posthaste
/// itself or the platform cannot tell.
pub fn foreground_app() -> Option<PreviousApp> {
    let (handle, name) = imp::foreground()?;
    Some(PreviousApp { name, handle })
}

/// Asks the OS to give focus back to `app`. Returns whether the request was
/// made; the window manager has the final say.
pub fn activate(app: &PreviousApp) -> bool {
    imp::activate(&app.handle)
}
