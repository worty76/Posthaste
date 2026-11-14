# Platform behaviour and limitations

Kept out of the README so it stays short. Everything here marked **verified**
was actually run on the named platform; anything else is an honest "not run"
or a read-only review of the code, never a claim.

### What was verified, and where

The original development ran on Ubuntu 24.04, X11 (Xvfb + openbox + picom),
WebKitGTK 2.52. Since then the app is built, installed and used daily on
macOS (Apple Silicon).

| | Linux X11 | Linux Wayland | macOS | Windows |
|---|---|---|---|---|
| Builds | verified | same binary | verified (Apple Silicon) | **not built** |
| Global shortcut | verified | limited, see below | not verified | not run |
| Capture window focus + typing | verified | not run | in daily use | not run |
| Centre on active display | verified (one display) | compositor decides | in daily use | not run |
| Focus returns to previous app | verified | left to compositor | in daily use | not run |
| Draft survives `kill -9` | verified | same code | same code | same code |
| Single instance, `--capture` | verified | not run | in daily use | not run |
| Tray menu | code runs; no tray host in the test display | not run | not verified | not run |
| Launch at login | not exercised | not exercised | not verified | not run |
| Multiple monitors, HiDPI | **not tested** | not tested | not tested | not tested |

The macOS and Windows code in `crates/platform` was checked by reading it
against the `objc2-app-kit` and `windows-sys` sources; macOS compiles and
runs (Apple Silicon). Expect to fix small things on the first Windows build.
The `#[cfg(target_os = "macos")]` blocks in `src-tauri/src` (overlay title
bar, Dock reopen, template tray icon) are in the same state.

### Linux, Wayland

Wayland does not let an application register global shortcuts, read which
window is focused, or position its own windows.

- **Shortcut**: registration goes through XWayland and may only fire while an
  X11 window has focus. Settings says so instead of showing "active".
  Reliable route: bind `posthaste --capture` to a key in your desktop's
  keyboard settings (GNOME: Settings → Keyboard → Custom Shortcuts; KDE:
  Shortcuts → Add Command). It reaches the running instance in a few
  milliseconds. Support for the `GlobalShortcuts` desktop portal would remove
  this step and is not implemented.
- **Position**: the compositor places the window, usually centred on the
  active output. The "Window position" setting may have no effect.
- **Focus return**: Posthaste cannot ask for it, but compositors return focus
  to the previous window when ours hides.
- **"from <app>"** on notes is not available.

### Linux, general

- Rounded corners and the shadow need a compositing window manager. Without
  one the capture window gets square black corners.
- The tray icon needs a StatusNotifier host. Stock GNOME has none (install the
  AppIndicator extension). The app cannot detect a missing host; use the
  shortcut, or launch Posthaste again to bring the window back.
- Some window managers apply focus-stealing prevention. If the capture window
  appears without focus, that policy is the cause.

### macOS

- The capture window is a normal always-on-top window, not an `NSPanel`. It
  will not appear over another application's **full-screen** space. Fixing
  that needs a non-activating panel.
- The system reports no conflict when another app already uses a shortcut;
  registration succeeds and whichever app registered first wins. Posthaste
  cannot detect this.
- Transparent windows use Tauri's `macOSPrivateApi`, which rules out the Mac
  App Store.
- The app is not signed or notarised.

### Windows (unverified)

- A shortcut held by another application fails to register, and the app says
  so and opens Settings.
- Needs the WebView2 runtime (preinstalled on Windows 11).
- "Active display" means the display under the mouse pointer on every OS.

## How it is built

```
src/                      React + TypeScript UI (no business logic)
  lib/ipc.ts              the only module that calls the native side; typed
  lib/                    pure logic: dates, query building, shortcuts, draft sync
  components/             Button, inputs, Switch, Segmented, Dialog, Toasts, Kbd, …
  capture/                the floating capture window
  main/                   inbox, search, settings
  styles/tokens.css       design tokens: colour, type, spacing, motion
src-tauri/
  crates/core/            storage. SQLite, migrations, notes, drafts, search,
                          settings, export/import. No Tauri dependency.
  crates/platform/        per-OS "which app was in front / give focus back"
  src/                    Tauri shell: windows, shortcuts, tray, commands
scripts/e2e-linux.sh      end-to-end test against real windows under Xvfb
```

Decisions worth knowing:

- **Both windows are created once at startup and hidden.** The shortcut only
  shows an existing window, which is why it appears quickly.
- **A note is "saved" only after SQLite commits** (`journal_mode=WAL`,
  `synchronous=FULL`). The capture window clears and hides after that, never
  before. On failure the text stays and the error is shown.
- **Drafts** are written to the `drafts` table ~250 ms after each keystroke and
  flushed on Esc, focus loss and hide. Saving a note and clearing its draft is
  one transaction.
- **Search** is SQLite FTS5 (prefix matching, diacritics ignored), kept in sync
  by triggers. Input is tokenised before it reaches FTS, so no query syntax can
  break it.
- **Migrations** are versioned with `PRAGMA user_version`, each in its own
  transaction. Before upgrading a database that has data, a snapshot is written
  next to it (`posthaste.db.before-upgrade-from-vN.bak`). A database from a
  newer version is refused, not modified.
- **Delete** moves a note to a trash that is emptied after 24 hours, which is
  what makes Undo possible.
- **rusqlite, not SQLx**: one local user and one connection behind a mutex; an
  async pool would add weight without benefit.
- **Logging** records events and error kinds, never note text.

Data location: `<app data dir>/dev.posthaste.desktop/posthaste.db`
(`~/.local/share/…` on Linux, `~/Library/Application Support/…` on macOS,
`%APPDATA%\…` on Windows). Settings → Data shows the exact path.
