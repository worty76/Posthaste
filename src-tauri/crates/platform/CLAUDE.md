<!-- Generated from AGENTS.md by scripts/sync-rules.sh. Edit AGENTS.md, then run `npm run sync:rules`. -->

# crates/platform: per-OS code

Answers two questions the capture flow needs: which application was in front,
and how to give focus back to it. One file per OS behind one small API in
`lib.rs`.

## Rules

- The public API in `lib.rs` is OS-neutral. Callers never see an X11 window id,
  an `HWND`, or a pid. A new capability is added to the API first, then
  implemented in every OS file, including a do-nothing version in
  `unsupported.rs`.
- Each OS file exports the same items: `Handle`, `session()`, `foreground()`,
  `activate()`. Keep the signatures identical across files.
- Functions return `Option` or `bool` and never panic. When the OS says no, or
  the session cannot answer (Wayland), return `None`/`false`. The caller
  already handles that.
- `foreground()` returns an application name at most. Never a window title,
  document name or URL: those contain private text.
- Posthaste's own windows are handled explicitly (see the `_NET_WM_PID` check
  in `linux.rs`), so notes never say "from Posthaste".
- Every `unsafe` block has a `// SAFETY:` comment stating why it is sound.
- Dependencies are per-target in `Cargo.toml`, with the minimum feature set.
  No dependency that needs a C toolchain or system headers beyond what Tauri
  already requires.
- This crate does not depend on Tauri or on `posthaste-core`.

## Verification

- Linux/X11 is exercised by `scripts/e2e-linux.sh`.
- `macos.rs` and `windows.rs` have not been compiled in this repo's
  development environment. If you change them and cannot build for that OS,
  check each call against the binding crate's source, and say "not compiled" in
  your summary and in the platform table in `docs/platform-notes.md`.
- Wayland cannot support this crate's features by design. Do not add
  compositor-specific hacks; the documented route is the `posthaste --capture`
  command bound in the desktop's own settings.
