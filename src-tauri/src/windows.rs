//! The two windows: the floating capture panel and the main inbox.

use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};

use posthaste_core::CapturePosition;
use serde::Serialize;
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};

use crate::state::{lock, AppState};

pub const MAIN: &str = "main";
pub const CAPTURE: &str = "capture";

/// Logical size of the capture window, including the transparent margin its
/// shadow is drawn in.
const CAPTURE_HEIGHT: f64 = 268.0;
const CAPTURE_MIN_WIDTH: f64 = 520.0;
const CAPTURE_MAX_WIDTH: f64 = 700.0;
/// Focus changes this soon after showing are the window manager settling,
/// not the user leaving.
const BLUR_GRACE: Duration = Duration::from_millis(300);

#[derive(Clone, Serialize)]
struct CaptureShown {
    /// Name of the app the user was in, when known.
    source: Option<String>,
}

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let main = WebviewWindowBuilder::new(app, MAIN, WebviewUrl::App("index.html".into()))
        .title("Posthaste")
        .inner_size(960.0, 660.0)
        .min_inner_size(620.0, 440.0)
        .center()
        .visible(false);
    #[cfg(target_os = "macos")]
    let main = main
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true);
    let main = main.build()?;

    let handle = app.clone();
    main.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            // Closing the inbox must not stop the capture shortcut working.
            api.prevent_close();
            if let Some(w) = handle.get_webview_window(MAIN) {
                let tray = handle
                    .state::<AppState>()
                    .tray_available
                    .load(Ordering::Relaxed);
                // Without a tray there would be no way back to a hidden
                // window, so keep it reachable in the taskbar instead.
                let _ = if tray { w.hide() } else { w.minimize() };
            }
        }
    });

    // Created once, hidden, and reused: showing an existing window is what
    // makes the shortcut feel instant.
    let capture = WebviewWindowBuilder::new(app, CAPTURE, WebviewUrl::App("index.html".into()))
        .title("Posthaste")
        .inner_size(620.0, CAPTURE_HEIGHT)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .maximizable(false)
        .minimizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible_on_all_workspaces(true)
        .visible(false)
        .build()?;

    let handle = app.clone();
    capture.on_window_event(move |event| match event {
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            hide_capture(&handle, true);
        }
        WindowEvent::Focused(false) => {
            let state = handle.state::<AppState>();
            let settled = lock(&state.capture_shown_at)
                .map(|t| t.elapsed() > BLUR_GRACE)
                .unwrap_or(false);
            if settled && state.settings().hide_on_blur {
                // The user moved on by themselves: don't pull focus back.
                hide_capture(&handle, false);
            }
        }
        _ => {}
    });
    Ok(())
}

pub fn toggle_capture(app: &AppHandle) {
    let Some(window) = app.get_webview_window(CAPTURE) else {
        return;
    };
    if window.is_visible().unwrap_or(false) {
        hide_capture(app, true);
    } else {
        show_capture(app);
    }
}

pub fn show_capture(app: &AppHandle) {
    let Some(window) = app.get_webview_window(CAPTURE) else {
        log::error!("capture window is missing");
        return;
    };
    let state = app.state::<AppState>();

    // Must happen before our window takes focus.
    let previous = posthaste_platform::foreground_app();
    let source = previous.as_ref().and_then(|p| p.name.clone());
    *lock(&state.previous_app) = previous;

    let placed = place_capture(app, &window, state.settings().capture_position);
    *lock(&state.capture_shown_at) = Some(Instant::now());

    if let Err(e) = window.show() {
        log::error!("capture window could not be shown: {e}");
        return;
    }
    // Some window managers only honour a position once the window is mapped.
    if let Some(pos) = placed {
        let _ = window.set_position(pos);
    }
    let _ = window.set_always_on_top(true);
    if let Err(e) = window.set_focus() {
        log::warn!("capture window could not take focus: {e}");
    }
    let _ = window.emit("capture-shown", CaptureShown { source });
}

/// Hides the capture window. With `restore_focus`, hands focus back to the
/// application the user was in when they triggered capture.
pub fn hide_capture(app: &AppHandle, restore_focus: bool) {
    let state = app.state::<AppState>();
    *lock(&state.capture_shown_at) = None;
    let previous = lock(&state.previous_app).take();
    let Some(window) = app.get_webview_window(CAPTURE) else {
        return;
    };
    let handle = app.clone();
    // One main-thread step, so the hide and the re-activation cannot reorder.
    let result = app.run_on_main_thread(move || {
        let _ = window.emit("capture-hidden", ());
        if let Err(e) = window.hide() {
            log::error!("capture window could not be hidden: {e}");
        }
        if !restore_focus {
            return;
        }
        match previous {
            Some(prev) if posthaste_platform::activate(&prev) => {}
            Some(_) => log::debug!("previous application could not be re-activated"),
            None => release_focus(&handle),
        }
    });
    if let Err(e) = result {
        log::error!("could not schedule hiding the capture window: {e}");
    }
}

/// Gives focus up when no previous application was recorded: Posthaste
/// itself was in front, or the platform cannot tell (Wayland). On macOS,
/// hiding the app returns focus to whatever is behind it; we only do that
/// when the inbox isn't open, since it would be hidden too. Elsewhere the
/// window manager picks the next window by itself.
#[cfg(target_os = "macos")]
fn release_focus(app: &AppHandle) {
    let inbox_open = app
        .get_webview_window(MAIN)
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);
    if !inbox_open {
        let _ = app.hide();
    }
}

#[cfg(not(target_os = "macos"))]
fn release_focus(_app: &AppHandle) {}

/// Shows and focuses the inbox, optionally switching to a view
/// ("inbox", "today", "archive", "settings").
pub fn show_main(app: &AppHandle, view: Option<&str>) {
    let Some(window) = app.get_webview_window(MAIN) else {
        log::error!("main window is missing");
        return;
    };
    let _ = window.unminimize();
    if let Err(e) = window.show() {
        log::error!("main window could not be shown: {e}");
    }
    let _ = window.set_focus();
    if let Some(view) = view {
        let _ = window.emit("navigate", view);
    }
}

/// Sizes the capture window for the display the pointer is on and returns
/// where it should go. `None` means the platform gave us nothing to work
/// with (typical on Wayland, where the compositor places windows itself).
fn place_capture(
    app: &AppHandle,
    window: &WebviewWindow,
    position: CapturePosition,
) -> Option<PhysicalPosition<i32>> {
    // The display under the pointer is the best cross-platform signal for
    // "the display the user is working on".
    let monitor = app
        .cursor_position()
        .ok()
        .and_then(|p| app.monitor_from_point(p.x, p.y).ok().flatten())
        .or_else(|| window.current_monitor().ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        let _ = window.center();
        return None;
    };

    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let (area_w, area_h) = (area.size.width as f64, area.size.height as f64);

    let width = (area_w / scale * 0.42).clamp(CAPTURE_MIN_WIDTH, CAPTURE_MAX_WIDTH);
    let width = width.min(area_w / scale - 16.0).max(280.0);
    let (w, h) = ((width * scale).round(), (CAPTURE_HEIGHT * scale).round());

    let x = area.position.x as f64 + (area_w - w) / 2.0;
    let y = match position {
        CapturePosition::Center => area.position.y as f64 + (area_h - h) / 2.0,
        CapturePosition::Upper => area.position.y as f64 + (area_h * 0.22).min(area_h - h),
    };
    let pos = PhysicalPosition::new(
        x.round() as i32,
        y.max(area.position.y as f64).round() as i32,
    );

    // Position first so the size is applied at the destination display's scale.
    let _ = window.set_position(pos);
    // The window is fixed-size by pinning min and max to the same value
    // rather than by `resizable(false)`, which on GTK would also stop us
    // resizing it for a different display.
    let size = PhysicalSize::new(w as u32, h as u32);
    let _ = window.set_min_size(Some(size));
    let _ = window.set_max_size(Some(size));
    let _ = window.set_size(size);
    Some(pos)
}
