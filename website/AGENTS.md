# website/ — the Posthaste marketing site

This folder is the marketing site only. It is a Next.js (static export) app:
`npm install && npm run dev` here, `npm run build` writes plain files to
`out/` for any static host. It never imports from the app's `src/` or
`src-tauri/` — the product facts it states live in `src/config.ts` and
`src/lib/looks.ts`.

Honesty rules (binding): no invented proof (testimonials, counts, ratings,
logos), no download links that do not exist (`DOWNLOADS` null → "Build from
source"), platform claims must keep the "tested on Linux" note, no privacy
wording beyond "local-first, no account, no network requests", no features
beyond the shipped app. The page itself makes no third-party requests: no
analytics, no cookies, no CDN fonts or embeds.

The single source of look data is `src/lib/looks.ts`; every colour on the
site comes from it or from `src/lib/derive.ts` over it. CSS custom
properties are applied to `<html>` only by `src/components/LookProvider.tsx`.

Tests: `npm test` (share-code, contrast, derivation — derivation is pinned
to the app's Rust golden values). Formatting: `npm run format`. Never edit
files outside `website/` and `docs/` when working on the site.
