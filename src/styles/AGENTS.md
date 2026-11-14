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

## Themes (planned; follow this when building them)

- A theme is data: a set of values for existing tokens. It never contains
  selectors, layout, or arbitrary CSS.
- Only an allow-listed subset of tokens is themeable (colours, radii, font
  stack choice from a fixed list). Spacing, sizes and layout are not.
- Theme values are validated before use (type, range, contrast for text
  tokens) and applied as custom properties on the root element. A theme that
  fails validation is rejected whole, with a message; it is never partly
  applied.
- Themes come from other people. Treat every value as untrusted input: no
  `url()`, no `@import`, nothing that can load a resource or run code.
