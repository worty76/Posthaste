# src/: the React UI

Renders state and handles input. It decides nothing about what a valid note is
or how it is stored; the Rust side owns that.

## Structure

```
lib/         pure logic and the IPC boundary. No React, no DOM where avoidable.
hooks/       shared stateful logic used by more than one window
components/  reusable, product-agnostic controls (Button, Dialog, Toasts, …)
capture/     the floating capture window
main/        inbox, search, settings
styles/      tokens and stylesheets (see styles/AGENTS.md)
test/        test setup and the IPC mock
```

- `components/` knows nothing about notes. If a component imports from
  `lib/ipc` or mentions a note, it belongs in `capture/` or `main/`.
- Before writing a control, check `components/`. Extend an existing one with a
  prop rather than creating a near-duplicate.
- Logic that can be a pure function goes in `lib/` with a test in
  `lib/lib.test.ts` (dates, query building, shortcut parsing are the models).

## The IPC boundary

- `lib/ipc.ts` is the only file that imports `@tauri-apps/*` (plus the window
  label lookup in `main.tsx`). Components call `api.*` and `on(...)`.
- Every command has a typed wrapper there. No `invoke("name")` strings anywhere
  else.
- `lib/types.ts` mirrors the Rust serde types field for field, in snake_case.
  Change both sides in the same change.
- Failures arrive as `{ code, message }`. Convert with `toAppError`. Show
  `message` to the user; branch on `code`, never on message text.

## State

- Persistent state lives in SQLite through commands. No `localStorage`,
  `sessionStorage` or `indexedDB`.
- No state library. `useState`/`useReducer` in the window component, passed
  down. Add context only when three or more levels need the same value.
- Data changed elsewhere arrives as the `notes-changed` or `settings-changed`
  event. Refetch on the event; do not hand-patch local copies to mirror what
  the database probably did.
- Async results can arrive out of order. Guard with a request counter the way
  `MainWindow` does for list queries.

## Keyboard

- Every action reachable by mouse is reachable by keyboard, and the reverse.
- Skip handling while `e.nativeEvent.isComposing` is true. Enter during IME
  composition (Vietnamese Telex, CJK) must not save.
- Use `hasMod(e, os)` for "⌘ on macOS, Ctrl elsewhere". Never test `ctrlKey`
  or `metaKey` directly for a shortcut.
- Single-letter shortcuts never fire while focus is in an input or textarea.
- A new shortcut is added in three places together: the handler, the tooltip or
  label that advertises it, and the `ShortcutHelp` list.

## Capture window specifics

- The textarea has focus whenever the window is shown. Nothing may steal it.
- Draft writes go through `DraftSync` only. A save calls `drafts.cancel()` and
  awaits it before `captureSave`, so a late draft write cannot resurrect text
  that was just filed.
- Nothing is added to the capture window without asking. It is a command
  field, not a form.

## Accessibility

- Interactive elements are real `<button>`, `<input>`, `<dialog>`. No click
  handlers on `div`.
- Icon-only buttons use `IconButton` with a `label`.
- Errors render with `role="alert"`; passive status with `role="status"`.
- Focus is visible (the global `:focus-visible` rule). Do not remove outlines
  without an equivalent replacement.

## Styling from components

- Classes only. No `style={{…}}`, no colour or pixel literals in TSX.
- Class names are BEM-ish and scoped by block: `.note__meta`, `.btn--primary`.
- State is exposed to CSS through ARIA or `data-*` attributes
  (`aria-checked`, `data-selected`), not through extra class toggling.

## Tests

- Vitest + Testing Library. Query by role and accessible name, the way a user
  finds things. No test ids, no class-name selectors.
- Mock only `lib/ipc` via `test/mockIpc.ts`. Do not mock components or hooks.
- Test names state behaviour: "Escape closes and keeps what was typed as a
  draft", not "handles escape".
- Every new user-visible behaviour gets a test, including its failure path
  (the command rejects: what does the user see, and is their text still there).

## TypeScript

- `strict` and `noUncheckedIndexedAccess` stay on. No `any`, no `@ts-ignore`,
  no non-null `!` outside tests and the root element lookup.
- Named exports. Function components. Props typed with an `interface`.
