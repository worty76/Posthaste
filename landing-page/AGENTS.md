# landing-page/ — the Posthaste marketing site

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
site comes from it or from `src/lib/derive.ts` over it. The site wears the
Ink look statically — the token values in `src/app/globals.css` are derived
from that data and are not re-themed at runtime. The GitHub star count in
the header is fetched from the GitHub API at build time and baked into the
static HTML. On the mini PC, an hourly cron (~/bin/update-stars.sh) writes
the live count to stars.json inside the served folder, and StarChip
re-reads that file from the visitor's browser — a same-origin request, so
the page still makes no third-party requests. Deploy with
`rsync -az --delete --exclude=stars.json out/ …` so the hourly refresh
survives re-uploads.

Copy tone: this site is for non-technical readers. Plain language and
benefits first — no protocol names, file formats, file paths or build
commands in the primary sections. Developer details live only in the quiet
"Comfortable with a terminal?" block of the Get-it section.

Tests: `npm test` (share-code, contrast, derivation — derivation is pinned
to the app's Rust golden values). Formatting: `npm run format`. Never edit
files outside `landing-page/` and `docs/` when working on the site.
