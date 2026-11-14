<!-- Generated from AGENTS.md by scripts/sync-rules.sh. Edit AGENTS.md, then run `npm run sync:rules`. -->

# Posthaste: rules for anyone (human or AI) changing this repo

Each folder with its own rules has an `AGENTS.md`. Read this file, then the one
nearest the code you are touching. The nearest file wins on details; nothing
overrides the "Never" list below.

| Working in | Also read |
|---|---|
| `src/` (React UI) | `src/AGENTS.md` |
| `src/styles/` (tokens, CSS) | `src/styles/AGENTS.md` |
| `src-tauri/src/` (desktop shell) | `src-tauri/AGENTS.md` |
| `src-tauri/crates/core/` (storage) | `src-tauri/crates/core/AGENTS.md` |
| `src-tauri/crates/platform/` (per-OS code) | `src-tauri/crates/platform/AGENTS.md` |

`AGENTS.md` is the source of truth. Each `CLAUDE.md` is a generated copy for
Claude Code: edit `AGENTS.md`, then run `npm run sync:rules`. When a rule
turns out to be wrong or missing, change the rule file in the same change as
the code, and add a grep to `scripts/check-rules.sh` if a grep can enforce it.

## What this product is

A global shortcut opens a small window, you type, Enter saves, the window
disappears, and focus returns to what you were doing. Later the note is in the
inbox. Every change is judged against that loop: it must not get slower, need
more keystrokes, or become less reliable.

## Scope: do what was asked, nothing else

- Change only what the task needs. No drive-by refactors, renames, reformatting
  of untouched code, or dependency upgrades. If you see something worth fixing,
  say so in your summary instead of fixing it.
- Do not add a feature, setting, or abstraction that the task did not ask for.
  A new setting needs a reason a user would give, not "it might be useful".
- Do not add a dependency (npm or cargo) without asking first. State what it
  replaces and why the existing code cannot do it.
- If the task is unclear or conflicts with a rule here, stop and ask. Do not
  guess and build.
- Not in this product, do not build: accounts, sync, telemetry, AI features,
  reminders, calendars, folders, productivity scores.

## Never

1. **Never lose user text.** A note counts as saved only after SQLite commits.
   Nothing clears the input, hides the window, or shows "Saved" before that.
   On any failure the text stays on screen and stays in the draft.
2. **Never send anything off the machine.** No network requests, telemetry,
   analytics, remote fonts, or CDN assets. The CSP in `tauri.conf.json` stays
   as strict as it is.
3. **Never log note content**, drafts, or search text. Log events and error
   kinds only.
4. **Never edit a shipped migration.** Add a new numbered one.
5. **Never claim a check passed without running it**, and never claim a
   platform works without running on it. Say "not run" or "not verified".
6. **Never weaken a test to make it pass.** Fix the code, or explain why the
   test's expectation is wrong.

## Where things go

```
UI text, layout, keyboard handling      src/            (no business rules)
Call to the native side                 src/lib/ipc.ts  (the only place)
Colour, type, spacing, motion values    src/styles/tokens.css (the only place)
Validation, persistence, search         src-tauri/crates/core
Look validation and derivation          src-tauri/crates/core/src/look
"Which app was focused", per-OS calls   src-tauri/crates/platform
Windows, shortcuts, tray, commands      src-tauri/src
```

If a change seems to need logic in a layer where it does not belong (a rule in
a React component, SQL in a command, a colour in a component), move the logic
to its layer rather than bending the boundary.

## Adding a feature end to end

Follow the existing path; do not invent a parallel one.

1. Storage: method on `Db` in `crates/core` with tests.
2. Command: thin adapter in `src-tauri/src/commands.rs`, registered in
   `lib.rs`, returning `AppResult<T>`.
3. Types: mirror any new serde type in `src/lib/types.ts`.
4. IPC: one typed wrapper in `src/lib/ipc.ts`, and the same name in
   `src/test/mockIpc.ts`.
5. UI: component uses the wrapper. Test it against the mock.

## Done means

```sh
npm run check
(cd src-tauri && cargo fmt --all --check && cargo clippy --all-targets -- -D warnings && cargo test --workspace)
scripts/e2e-linux.sh        # when capture, focus, shortcuts or windows changed (Linux/X11)
```

All green, behaviour change covered by a test, README updated if user-facing
behaviour or a platform limitation changed. `scripts/check-rules.sh` enforces
the rules a grep can check; a rule being absent from it does not make it
optional.

## Writing style

- Comments explain why, not what. No comments that restate the code or narrate
  the change ("added X", "now uses Y").
- User-facing text: sentence case, plain verbs, says what happened and what to
  do next. Errors do not apologise and are never vague. One name per action
  everywhere ("Archive" in the button, the toast, and the shortcut list).
- Match the file you are in: naming, ordering, formatting. Prettier and rustfmt
  decide formatting; do not argue with them.
