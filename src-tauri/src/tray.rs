//! System tray (Windows, Linux) / menu bar (macOS) icon and its menu.

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::AppHandle;

use crate::windows;

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Posthaste", true, None::<&str>)?;
    let capture = MenuItem::with_id(app, "capture", "New Posthaste", true, None::<&str>)?;
    let inbox = MenuItem::with_id(app, "inbox", "Open Inbox", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Posthaste", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &open,
            &capture,
            &inbox,
            &PredefinedMenuItem::separator(app)?,
            &settings,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;

    // macOS gets a monochrome template image; elsewhere panels can be light
    // or dark, so the full-colour icon is the one that is always visible.
    #[cfg(target_os = "macos")]
    let icon = Image::from_bytes(include_bytes!("../icons/tray.png"))?;
    #[cfg(not(target_os = "macos"))]
    let icon = Image::from_bytes(include_bytes!("../icons/tray-color.png"))?;
    let builder = TrayIconBuilder::with_id("posthaste")
        .icon(icon)
        .tooltip("Posthaste")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => windows::show_main(app, None),
            "capture" => windows::show_capture(app),
            "inbox" => windows::show_main(app, Some("inbox")),
            "settings" => windows::show_main(app, Some("settings")),
            "quit" => app.exit(0),
            _ => {}
        });
    // A template image lets macOS tint the icon for light and dark menu bars.
    #[cfg(target_os = "macos")]
    let builder = builder.icon_as_template(true);
    builder.build(app)?;
    Ok(())
}
