<p align="center">
  <img src="landing-page/public/logo-256.png" width="96" alt="Posthaste logo">
</p>

<h1 align="center">Posthaste</h1>

<p align="center">
  Capture a thought in two seconds. Get back to work.<br>
  <strong>Fast. Local. Free.</strong>
</p>

<p align="center">
  <a href="https://posthaste.worty.id.vn">Download for macOS, Windows and Linux</a>
  ·
  <a href="https://github.com/worty76/Posthaste/releases/latest">Releases</a>
</p>

---

Press the global shortcut from anywhere, type, hit Enter. The window disappears,
focus returns to what you were doing, and the note is waiting in your inbox.

Your notes live in one SQLite file on your machine. No account, no sync, no
telemetry — nothing leaves your computer unless you turn on AI polish yourself.

## Why Posthaste

- **Instant capture** — the windows are created at startup and hidden, so the
  shortcut shows them in milliseconds
- **Local-first** — one database file, exportable and backup-able from Settings
- **Looks** — six built-in colour themes, or make your own with a live editor
  that refuses anything hard to read; share any look with a one-line code
- **AI polish** — optional. Off by default; when you turn it on, your note goes
  straight to the provider you picked with your own API key
- **In-app updates** — signed installers, one click, nothing auto-runs
- **Keyboard-driven** — every action has a shortcut; see them all with `?`

## Shortcuts

| | macOS | Windows / Linux |
|---|---|---|
| Capture a note | ⌘⇧Space | Ctrl+Shift+Space |
| Open the inbox | ⌘⌃N | Ctrl+Alt+N |

In the capture window: Enter saves, Shift+Enter adds a line, Esc keeps a draft.
In the inbox: ↑/↓ move, E edit, X complete, A archive, C copy, / search,
1/2/3 switch sections, N new note. Both shortcuts are changeable in Settings.

## Build from source

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
npm run tauri build      # release build + installers for your OS
npm run check            # typecheck, lint, tests, rule checks
```

Contributing rules live in the `AGENTS.md` files at the root and in each
source folder. Wayland users: global shortcuts need a desktop binding —
bind `posthaste --capture` to a key in your keyboard settings.

## Not in it, on purpose

Accounts, sync, reminders, folders, statistics. Posthaste does one job and
stays out of the way.

Platform notes and architecture details: [docs/platform-notes.md](docs/platform-notes.md).

## Licence

MIT
