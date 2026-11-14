import { ShareCodeRow } from "@/components/ShareCodeRow";
import { HeroDemo } from "@/components/HeroDemo";
import { HeroActions } from "@/components/HeroActions";
import { HowItWorks } from "@/components/HowItWorks";
import { MiniInbox } from "@/components/MiniInbox";
import { ContrastToy } from "@/components/ContrastToy";
import { GitHubMark } from "@/components/icons";
import { StarChip } from "@/components/StarChip";
import { LookMiniature } from "@/components/mini";
import { LOOKS } from "@/lib/looks";
import { PRODUCT } from "@/config";

const MINIATURE_NOTES: Record<string, { note: string; category: string }> = {
  "strawberry-milk": { note: "Smoothie: banana, oat milk", category: "home" },
  matcha: { note: "Call grandma on Sunday", category: "home" },
  "lavender-haze": { note: "Sketch: sticker ideas", category: "ideas" },
  "midnight-grape": { note: "Draft the demo script", category: "work" },
  blueberry: { note: "Finish the book chapter", category: "goals" },
  ink: { note: "Gather receipts, ugh", category: "life" },
};

const PLATFORMS: { key: "mac" | "windows" | "linux"; name: string; asset: string }[] = [
  { key: "mac", name: "macOS", asset: ".dmg" },
  { key: "windows", name: "Windows", asset: "x64-setup.exe" },
  { key: "linux", name: "Linux", asset: ".AppImage" },
];

/** Direct download links, baked at build time from the latest release the
    build-and-release workflow published. Null for a platform means its
    installer is not in that release yet. */
async function getDownloads(): Promise<Record<string, string | null>> {
  try {
    const res = await fetch("https://api.github.com/repos/worty76/Posthaste/releases/latest", {
      cache: "no-store",
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return { mac: null, windows: null, linux: null };
    const data = (await res.json()) as { assets?: { name?: string; browser_download_url?: string }[] };
    const out: Record<string, string | null> = { mac: null, windows: null, linux: null };
    for (const a of data.assets ?? []) {
      const name = (a.name ?? "").toLowerCase();
      const url = a.browser_download_url ?? null;
      if (!url) continue;
      if (name.endsWith(".dmg") && out.mac === null) out.mac = url;
      if (name.endsWith("x64-setup.exe") && out.windows === null) out.windows = url;
      if (name.endsWith(".appimage") && out.linux === null) out.linux = url;
    }
    return out;
  } catch {
    return { mac: null, windows: null, linux: null };
  }
}

/** Stargazer count, fetched once at build time and baked into the static
    HTML. The page itself still makes no runtime requests to anyone; when
    the API is unreachable the count simply does not render. */
async function getStars(): Promise<number | null> {
  try {
    const res = await fetch("https://api.github.com/repos/worty76/Posthaste", {
      // Always fresh: a cached response here meant the site showed a stale
      // star count for hours after deploy.
      cache: "no-store",
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { stargazers_count?: unknown };
    return typeof data.stargazers_count === "number" ? data.stargazers_count : null;
  } catch {
    return null;
  }
}

export default async function Page() {
  const [stars, downloads] = await Promise.all([getStars(), getDownloads()]);

  return (
    <>
      <header className="page site-head">
        <a className="wordmark" href="/">
          Posthaste
        </a>
        <span className="site-head__spacer" />
        <StarChip baked={stars} />
        <a className="site-head__icon" href={PRODUCT.repoUrl} aria-label="Posthaste on GitHub">
          <GitHubMark />
        </a>
      </header>

      <main className="page">
        {/* 1. Hero: promise, working demo, actions. */}
        <section className="hero" aria-labelledby="hero-title">
          <div>
            <h1 className="hero__title" id="hero-title">
              A thought goes down in two seconds. You're back.
            </h1>
            <p className="hero__sub">
              Press one shortcut, type what's on your mind, press Enter. Done — the note is saved
              and you're back to whatever you were doing. Free, private, no account.
            </p>
            <HeroActions />
          </div>
          <HeroDemo />
        </section>

        {/* 2. How it works in three beats, keys per detected OS. */}
        <section className="section" aria-labelledby="how-title">
          <h2 className="section__title" id="how-title">
            How it works
          </h2>
          <p className="section__lede">
            Three beats, no setup, nothing to learn up front. The keys below match your system; the
            toggle shows the others.
          </p>
          <HowItWorks />
        </section>

        {/* 3. Your notes stay organized and easy to find. */}
        <section className="section" aria-labelledby="inbox-title">
          <h2 className="section__title" id="inbox-title">
            Everything you save, easy to find
          </h2>
          <p className="section__lede">
            Notes land in your inbox. Finished ones move to the archive, out of the way but never
            gone. Looking for something? Search finds any note in a blink — even years later.
          </p>
          <div className="inbox-grid">
            <MiniInbox />
            <div className="keys-legend">
              <h3>Try it with the keyboard</h3>
              <div className="keys-legend__row">
                <span>Move</span>
                <span>
                  <kbd>J</kbd> <kbd>K</kbd> or arrows
                </span>
              </div>
              <div className="keys-legend__row">
                <span>Complete</span>
                <span>
                  <kbd>X</kbd>
                </span>
              </div>
              <div className="keys-legend__row">
                <span>Search</span>
                <span>
                  <kbd>/</kbd>
                </span>
              </div>
              <div className="keys-legend__row">
                <span>Clear</span>
                <span>
                  <kbd>esc</kbd>
                </span>
              </div>
              <p style={{ color: "var(--muted)", fontSize: "var(--t-sm)", margin: 0 }}>
                Prefer the mouse? Everything works with a click too — shortcuts are just faster once
                you're used to them.
              </p>
            </div>
          </div>
          <p className="section__note">
            Changed your mind about deleting something? It sits in a trash for 24 hours first — undo
            is always one click away. And your notes save instantly, so nothing is lost even if your
            computer gives up.
          </p>
        </section>

        {/* 4. Looks: six live miniatures, make-your-own toy. */}
        <section className="section" aria-labelledby="looks-title">
          <h2 className="section__title" id="looks-title">
            Make it yours
          </h2>
          <p className="section__lede">
            Change the whole mood of the app — six ready-made looks, from soft Strawberry Milk to
            all-black Ink. Or mix your own colors in seconds.
          </p>
          <div className="looks-grid">
            {LOOKS.map((look) => {
              const sample = MINIATURE_NOTES[look.id] ?? { note: look.name, category: "demo" };
              return (
                <LookMiniature
                  key={look.id}
                  look={look}
                  note={sample.note}
                  category={sample.category}
                />
              );
            })}
          </div>
          <p className="section__lede" style={{ marginBottom: 16 }}>
            "Make your own" lets you pick any colors you like — and the app checks that everything
            stays readable. If a combination is too hard on the eyes, it tells you instead of saving
            it:
          </p>
          <ContrastToy />
          <p className="section__lede" style={{ marginTop: 26, marginBottom: 0 }}>
            Found a look you love? Send it to a friend as a single line of text — they paste it in
            and instantly have the exact same theme. No account needed; it all happens in a chat.
          </p>
          <ShareCodeRow />
        </section>

        {/* 5. Privacy, in plain words. */}
        <section className="section" aria-labelledby="privacy-title">
          <h2 className="section__title" id="privacy-title">
            Your notes stay yours
          </h2>
          <p className="section__lede">
            Everything happens on your computer. There's no account to make, nothing to send, and no
            one reading over your shoulder.
          </p>
          <div className="privacy-grid">
            <div>
              <ul className="privacy-list privacy-list--no">
                <li>No account</li>
                <li>No tracking of any kind</li>
                <li>Even the app's logs skip your note text</li>
                <li>AI polish is opt-in — off until you add your own key</li>
              </ul>
              <ul className="privacy-list privacy-list--yes" style={{ marginTop: 18 }}>
                <li>Notes, drafts and themes live in one file on your computer</li>
                <li>Export, import and backup are files you keep</li>
                <li>Offline by default — AI polish is the only online feature, and only on request</li>
                <li>This page makes no third-party requests either</li>
              </ul>
            </div>
            <div>
              <h3 style={{ fontSize: "var(--t-md)", marginBottom: 8 }}>What that means for you</h3>
              <p
                style={{ color: "var(--muted)", fontSize: "var(--t-sm)", lineHeight: "var(--lh)" }}
              >
                Your notes can't leak, because they never leave your machine. You could go offline
                forever and nothing would change. Want a copy? Export everything to a single file
                whenever you like.
              </p>
            </div>
          </div>
        </section>

        {/* 6. Get it. */}
        <section className="section" aria-labelledby="get-title" id="get-it">
          <h2 className="section__title" id="get-title">
            Get it
          </h2>
          <p className="section__lede">
            Free, and always local. Installers are on their way; for now you can grab the source
            code and run it yourself.
          </p>
          <div className="get-grid">
            <div className="get-rows">
              {PLATFORMS.map((p) =>
                downloads[p.key] ? (
                  <div className="get-row" key={p.key}>
                    <div>
                      <div className="get-row__name">{p.name}</div>
                      <div className="get-row__note">Free · installer</div>
                    </div>
                    <a className="btn btn--primary" href={downloads[p.key]!}>
                      Download
                    </a>
                  </div>
                ) : (
                  <div className="get-row" key={p.key}>
                    <div>
                      <div className="get-row__name">{p.name}</div>
                      <div className="get-row__note">Installer not in the latest build</div>
                    </div>
                    <a className="btn" href={PRODUCT.repoUrl}>
                      View on GitHub
                    </a>
                  </div>
                ),
              )}
              <p className="early-note">
                Early release: carefully tested on Linux so far; macOS and Windows installers are
                next. Every update to the main branch rebuilds these files automatically.
              </p>
            </div>
            <div>
              <h3 style={{ fontSize: "var(--t-md)", marginBottom: 8 }}>
                Prefer building it yourself?
              </h3>
              <pre className="build-snippet">
                <b>git</b> clone {PRODUCT.repoUrl}
                <br />
                <b>cd</b> Posthaste
                <br />
                <b>npm</b> install
                <br />
                <b>npm</b> run tauri build
              </pre>
              <p style={{ color: "var(--muted)", fontSize: "var(--t-sm)", marginTop: 10 }}>
                The repository's README walks you through it step by step.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* 7. Footer. */}
      <footer className="page site-foot">
        <span>No analytics, no cookies, no third-party requests on this page.</span>
        <span>
          Posthaste {PRODUCT.version} · <a href={PRODUCT.repoUrl}>source</a>
        </span>
      </footer>
    </>
  );
}
