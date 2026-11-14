// Everything that can change lives here. Nothing else on the site hard-codes
// product facts, and no download URL is ever invented: null means "not out
// yet" and the UI shows an honest fallback.

export const PRODUCT = {
  name: "Posthaste",
  version: "0.1.0",
  repoUrl: "https://github.com/worty76/Posthaste",
  /** Set when the site has a permanent home; canonical and share URLs use it. */
  siteUrl: "https://posthaste.worty.id.vn" as string | null,
  /** Real download URLs per platform; null = not released there yet. */
  downloads: {
    mac: null,
    windows: null,
    linux: null,
  } as { mac: string | null; windows: string | null; linux: string | null },
} as const;
