<!-- Generated from AGENTS.md by scripts/sync-rules.sh. Edit AGENTS.md, then run `npm run sync:rules`. -->

# src/styles/: tokens and stylesheets

`tokens.css` is the design system. Everything else consumes it. This split is
what makes the app themeable: a theme changes token values and nothing else.

## Files

| File | Holds |
|---|---|
| `tokens.css` | Every colour, font, size, radius, shadow, duration. Light and dark values. |
| `base.css` | Element resets, focus ring, scrollbars. |
| `ui.css` | Styles for `components/` (reusable controls). |
| `capture.css` | The capture window. |
| `main.css` | Inbox, search, settings layout. |

## Rules

- **Raw colours exist only in `tokens.css`.** No hex, `rgb()`, `hsl()` or named
  colours anywhere else, including TSX. `scripts/check-rules.sh` fails on this.
- **Tokens are semantic, named for their job, not their look**: `--surface`,
  `--text-muted`, `--accent`, `--danger`. Never `--amber`, `--gray-700`,
  `--blue`. A theme must be able to make `--accent` pink without any name
  becoming a lie.
- **Every colour token is defined in both the dark and the light block.** Add
  to both in the same change, and check both in the running app.
- **Spacing uses the `--s-*` scale**, type uses `--t-*`, radii use `--r-*`,
  motion uses `--fast`/`--quick` and `--ease`. Literal pixel values are for
  control dimensions (a 30px button height, an 18px checkbox) and hairlines,
  not for padding, gaps or margins.
- **Do not add a token for one use.** A token is a decision reused in several
  places. Check for an existing one first; most needs are already covered.
- **Derive, do not duplicate.** Tints come from `--accent-soft` or
  `color-mix(in srgb, var(--token) N%, transparent)`, not from a new hard-coded
  colour.
- **Text contrast**: `--text` and `--text-muted` on `--bg`, `--surface` and
  `--surface-raised` meet WCAG AA (4.5:1). `--text-faint` is for hints only,
  never for content. Changing any of these means re-checking contrast.
- **One accent.** Colour carries meaning: accent for the current or primary
  thing, danger for destructive or failed, ok for confirmed. Not decoration.
- **`--accent` is for fills and decoration** (buttons, checkboxes, the
  selection bar); **`--accent-ink` is for text and focus indicators** —
  anything the user must read or locate. A pastel look's `--accent` can fail
  contrast as text; `--accent-ink` is derived so it never does.
- **Motion** is short and answers a user action. Durations come from tokens so
  `prefers-reduced-motion` (which zeroes them) keeps working. No animation that
  loops or plays without a trigger.
- **Layout**: notes are rows separated by hairlines, not cards. Do not wrap
  content in bordered, shadowed boxes.
- **Selectors** stay flat: one class, optionally one state attribute. No ids,
  no `!important` (the reduced-motion block is the only exception), no nesting
  deeper than `.block .block__element`.
- **Fonts** are system stacks. No web fonts, no bundled font files, no remote
  assets of any kind.

## Looks (implemented)

A look is user- or bundled data that recolours the app: four colours, a base
(light/dark), a corner shape and a font style. The rules:

- A look is data: a validated JSON document. It never contains selectors,
  layout, or arbitrary CSS.
- The allow-list and derivation live in Rust, `src-tauri/crates/core/src/look/derive.rs`:
  a look document is validated there (hex-only colours, contrast floors) and
  turned into a fixed set of CSS custom properties. The frontend never
  computes a colour; `lib/appearance.ts` only applies the resulting token map
  to the root element.
- `shape` and `font` are ids, not values. Their pixel values and font stacks
  live in `tokens.css` and are selected through `data-shape`/`data-font`.
- Fills and decoration use `--accent`; text and focus indicators use
  `--accent-ink`, which derivation keeps readable for any accent.
- A look that fails validation is rejected whole, with a message; it is never
  partly applied. If the selected look cannot be resolved the app shows
  Default, never a broken UI.
- Adding a themeable token means updating `derive.rs`, its golden tests, and
  both the dark and the light block of `tokens.css` in the same change.
