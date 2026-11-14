use x11rb::connection::Connection;
use x11rb::protocol::xproto::{
    AtomEnum, ClientMessageEvent, ConnectionExt, EventMask, Window, CLIENT_MESSAGE_EVENT,
};
use x11rb::rust_connection::RustConnection;

use crate::Session;

pub type Handle = Window;

pub fn session() -> Session {
    let wayland = std::env::var_os("WAYLAND_DISPLAY").is_some_and(|v| !v.is_empty())
        || std::env::var("XDG_SESSION_TYPE").is_ok_and(|v| v.eq_ignore_ascii_case("wayland"));
    // GDK_BACKEND=x11 forces our own windows onto XWayland, but the windows of
    // native Wayland apps stay invisible to X either way.
    if wayland {
        Session::Wayland
    } else if std::env::var_os("DISPLAY").is_some_and(|v| !v.is_empty()) {
        Session::X11
    } else {
        Session::Unknown
    }
}

fn connect() -> Option<(RustConnection, Window)> {
    if session() != Session::X11 {
        return None;
    }
    let (conn, screen) = x11rb::connect(None).ok()?;
    let root = conn.setup().roots.get(screen)?.root;
    Some((conn, root))
}

fn atom(conn: &RustConnection, name: &[u8]) -> Option<u32> {
    Some(conn.intern_atom(false, name).ok()?.reply().ok()?.atom)
}

pub fn foreground() -> Option<(Handle, Option<String>)> {
    let (conn, root) = connect()?;
    let active = atom(&conn, b"_NET_ACTIVE_WINDOW")?;
    let window = conn
        .get_property(false, root, active, AtomEnum::WINDOW, 0, 1)
        .ok()?
        .reply()
        .ok()?
        .value32()?
        .next()
        .filter(|w| *w != 0)?;

    // When Posthaste's own inbox was in front we still want to hand focus
    // back to it, but "captured from Posthaste" would be noise.
    let own = atom(&conn, b"_NET_WM_PID")
        .and_then(|pid| {
            conn.get_property(false, window, pid, AtomEnum::CARDINAL, 0, 1)
                .ok()?
                .reply()
                .ok()?
                .value32()?
                .next()
        })
        .is_some_and(|pid| pid == std::process::id());
    if own {
        return Some((window, None));
    }

    // WM_CLASS is "instance\0class\0"; the class is the application's name.
    let name = conn
        .get_property(false, window, AtomEnum::WM_CLASS, AtomEnum::STRING, 0, 256)
        .ok()
        .and_then(|c| c.reply().ok())
        .and_then(|r| {
            r.value
                .split(|b| *b == 0)
                .rfind(|part| !part.is_empty())
                .map(|class| String::from_utf8_lossy(class).into_owned())
        });
    Some((window, name))
}

pub fn activate(window: &Handle) -> bool {
    let Some((conn, root)) = connect() else {
        return false;
    };
    let Some(active) = atom(&conn, b"_NET_ACTIVE_WINDOW") else {
        return false;
    };
    // EWMH: a client message to the root asks the window manager to activate
    // the window. Source indication 2 ("pager") is honoured even by window
    // managers with focus-stealing prevention.
    let event = ClientMessageEvent {
        response_type: CLIENT_MESSAGE_EVENT,
        format: 32,
        sequence: 0,
        window: *window,
        type_: active,
        data: [2u32, x11rb::CURRENT_TIME, 0, 0, 0].into(),
    };
    conn.send_event(
        false,
        root,
        EventMask::SUBSTRUCTURE_REDIRECT | EventMask::SUBSTRUCTURE_NOTIFY,
        event,
    )
    .is_ok()
        && conn.flush().is_ok()
}
