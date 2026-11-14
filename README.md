# Posthaste

The fastest way to get a thought down — and a starting point for what to do
with it next.

Quick capture is not new: plenty of apps open a small window, take your text,
and save it. This project starts there anyway, because capture that costs
nothing is the foundation everything else stands on. In a meeting, mid-call,
deep in a bug: when a thought arrives, it goes down in two seconds and you are
back to what you were doing.

Press the global shortcut, type, press Enter. The window disappears, focus
returns to the application you were in, and the note waits in the inbox later.

Local-first: one SQLite file on your machine, no account, no network requests.

**Where it's heading**

Capture is the first step, not the product. The interesting problem starts when
you come back to your inbox: a thought saved in two seconds should be just as
fast to use — to find, connect, and act on. What that becomes is still taking
shape, and it will drive the versions after this one.

| | macOS | Windows | Linux |
|---|---|---|---|
| Capture | ⌘⇧Space | Ctrl+Shift+Space | Ctrl+Shift+Space |
| Open inbox | ⌘⌃N | Ctrl+Alt+N | Ctrl+Alt+N |

Both are changeable in Settings → Keyboard.

## Run it

Prerequisites: Node 20+, Rust (stable), and the
[Tauri 2 system dependencies](https://v2.tauri.app/start/prerequisites/) for
your OS. On Debian/Ubuntu:

```sh
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev \
  librsvg2-dev libxdo-dev libssl-dev build-essential
```

```sh
npm install
npm run tauri dev        # develop
npm run tauri build      # release build + installers for the current OS
```

Checks:

```sh
npm run check                                  # tsc, eslint, prettier, vitest
(cd src-tauri && cargo fmt --all --check && cargo clippy --all-targets -- -D warnings && cargo test --workspace)
scripts/e2e-linux.sh                           # real-window capture flow, Linux/X11
```

## Rules for contributors and AI agents

`AGENTS.md` at the root and in `src/`, `src/styles/`, `src-tauri/`,
`src-tauri/crates/core/` and `src-tauri/crates/platform/` state the rules for
each layer: what belongs there, what never happens, and how to add a feature.
`CLAUDE.md` files are generated copies for Claude Code (`npm run sync:rules`).
`scripts/check-rules.sh` enforces the rules a grep can check and runs as part
of `npm run check`.

## Using it

**Capture window**

| Key | Action |
|---|---|
| Enter | Save and close |
| Shift+Enter | New line |
| ⌘/Ctrl+Enter | Save and keep the window open for another note |
| Esc | Close. Anything typed is kept as a draft and is there next time |
| Tab | Move to the optional category field |

"Enter adds a line" mode (Settings → Capture) swaps Enter and ⌘/Ctrl+Enter.

**Inbox**: ↑/↓ or J/K move, E edit, X complete, A archive, R move back to
inbox, C copy, Delete delete (with undo), / search, 1/2/3 switch section, N new
note, ⌘/Ctrl+, settings, ? shows this list.

**Command line** (also how a second launch talks to the running app):
`posthaste --capture`, `--inbox`, `--settings`, `--minimized`.

## Looks

A look is a small colour scheme — background, surface, text and one accent —
plus a corner shape and a font style, that applies to both windows
immediately. Settings → Appearance has the gallery: six bundled looks, and
"Make your own" opens an editor that previews live and refuses any combination
that would be hard to read.

**Sharing**: pick a look, press "Copy share code", and send the one-line code
to anyone. They paste it into "Add from code…" — no file, no account, and the
code never leaves your chat app. Posthaste checks a pasted look for
legibility (text contrast) before it can be used, whoever wrote it.

Platform note: the Rounded font renders only where the OS provides a rounded
face (macOS); on Windows and Linux it falls back to the system font.
Looks are stored locally with your notes; "Clear data" removes them too.

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

## Platform behaviour and limitations

### What was verified, and where

Everything below marked **verified** was run on Ubuntu 24.04, X11 (Xvfb +
openbox + picom), WebKitGTK 2.52. Nothing was run on macOS, Windows or a real
Wayland session: there was no such machine available during development.

| | Linux X11 | Linux Wayland | macOS | Windows |
|---|---|---|---|---|
| Builds | verified | same binary | **not built** | **not built** |
| Global shortcut | verified | limited, see below | not run | not run |
| Capture window focus + typing | verified | not run | not run | not run |
| Centre on active display | verified (one display) | compositor decides | not run | not run |
| Focus returns to previous app | verified | left to compositor | not run | not run |
| Draft survives `kill -9` | verified | same code | same code | same code |
| Single instance, `--capture` | verified | not run | not run | not run |
| Tray menu | code runs; no tray host in the test display | not run | not run | not run |
| Launch at login | not exercised | not exercised | not run | not run |
| Multiple monitors, HiDPI | **not tested** | not tested | not tested | not tested |

The macOS and Windows code in `crates/platform` was checked by reading it
against the `objc2-app-kit` and `windows-sys` sources, not by compiling it: the
build environment could not download cross-compilation targets. Expect to fix
small things on the first macOS/Windows build. The `#[cfg(target_os = "macos")]`
blocks in `src-tauri/src` (overlay title bar, Dock reopen, template tray icon)
are in the same state.

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

### macOS (unverified, by design intent)

- The capture window is a normal always-on-top window, not an `NSPanel`. It
  will not appear over another application's **full-screen** space. Fixing
  that needs a non-activating panel.
- The system reports no conflict when another app already uses a shortcut;
  registration succeeds and whichever app registered first wins. Posthaste
  cannot detect this.
- Transparent windows use Tauri's `macOSPrivateApi`, which rules out the Mac
  App Store.
- The app is not signed or notarised.

### Windows (unverified, by design intent)

- A shortcut held by another application fails to register, and the app says
  so and opens Settings.
- Needs the WebView2 runtime (preinstalled on Windows 11).
- "Active display" means the display under the mouse pointer on every OS.

## Not in this version

Accounts, sync, AI features, reminders, calendars, folders, statistics. On
purpose.

## Licence

The crates are marked MIT as a placeholder. Change it to whatever you want.
