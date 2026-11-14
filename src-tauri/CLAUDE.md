<!-- Generated from AGENTS.md by scripts/sync-rules.sh. Edit AGENTS.md, then run `npm run sync:rules`. -->

# src-tauri/: the desktop shell

Wires storage, windows, shortcuts and the tray together. It contains no
business rules (those are in `crates/core`) and no per-OS system calls (those
are in `crates/platform`).

## Files in `src/`

| File | Owns |
|---|---|
| `lib.rs` | Startup order, plugin registration, command list, launch flags |
| `commands.rs` | Every `#[tauri::command]`. Thin adapters only |
| `windows.rs` | Creating, showing, hiding, placing both windows |
| `shortcuts.rs` | Global shortcut registration and its status report |
| `tray.rs` | Tray icon and menu |
| `state.rs` | `AppState`, database access, lock helper |
| `error.rs` | `AppError { code, message }`, the only error shape commands return |

## Commands

- A command validates nothing and stores nothing itself. It calls one or two
  `Db` methods through `state.with_db`, emits an event if data changed, and
  returns. If you are writing SQL or an `if` about note content here, it
  belongs in `crates/core`.
- Return `AppResult<T>`. `message` is written for the person using the app;
  `code` is stable and snake_case, because the frontend branches on it.
- After any change to notes, call `notes_changed(&app)`. After settings change,
  emit `settings-changed`. Windows refetch on these.
- Commands that open a file dialog or block are `async`. Others are sync.
- A new command is added in four places in the same change: `commands.rs`, the
  `generate_handler!` list in `lib.rs`, `src/lib/ipc.ts`, `src/test/mockIpc.ts`.

## Errors and panics

- No `unwrap()` or `expect()` outside tests. The one exception is the final
  `.expect` on app build in `lib.rs`.
- Lock mutexes with `state::lock`, which recovers from poisoning. A panicked
  thread must not make notes unreachable.
- A failed side feature (tray, shortcut, autostart) is logged, recorded in
  state, shown to the user, and the app keeps running. Only a failed window
  creation aborts startup.
- Never report success for something the OS refused. Shortcut status is the
  model: `registered: false` plus a reason, surfaced in the UI.

## Windows and focus

- Both windows are created once at startup, hidden, and reused. Do not create
  or destroy windows per use; that is what keeps the shortcut fast.
- Showing capture is ordered: record the foreground app, place the window,
  show, focus, emit `capture-shown`. Recording must happen before our window
  takes focus.
- Hiding and handing focus back happen in one `run_on_main_thread` closure so
  they cannot reorder.
- Any change here is verified with `scripts/e2e-linux.sh`, and the platform
  table in `docs/platform-notes.md` is updated to say what was and was not run.

## Platform differences

- Per-OS system calls go in `crates/platform`, not here.
- `#[cfg(target_os = …)]` in this crate is limited to choosing a Tauri option
  (title bar style, tray template icon, Dock reopen). Keep each block a few
  lines, with a comment saying why that OS differs.
- Code for an OS you cannot build on is marked unverified in
  `docs/platform-notes.md`. Do not describe it as working.

## Logging and privacy

- `log::info!/warn!/error!` with events and error kinds. Never note text,
  draft text, category names, search queries, or full file paths chosen by the
  user.
- No new Tauri capability, plugin, or CSP relaxation without asking.
  `capabilities/default.json` lists the minimum; keep it that way.

## Releases

- The version lives in exactly one place: `version` under
  `[workspace.package]` in `Cargo.toml`. `tauri.conf.json` and `package.json`
  intentionally have no version field; Tauri resolves it from Cargo.toml for
  the bundle, the updater manifest, the frontend's `app_info`, and the CI
  release tag. Bumping it there is the whole release.

## Style

- `cargo fmt` and `cargo clippy --all-targets -- -D warnings` clean.
- Module-level `//!` comment says what the file owns. Function comments say
  why, and state ordering or safety constraints.
- Settings changes go through `settings_update`, which applies side effects and
  rolls back on failure. Do not write settings from anywhere else.
