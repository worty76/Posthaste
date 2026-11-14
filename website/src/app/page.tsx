import { ShareCodeRow } from "@/components/ShareCodeRow";
import { HeroDemo } from "@/components/HeroDemo";
import { HeroActions } from "@/components/HeroActions";
import { HowItWorks } from "@/components/HowItWorks";
import { MiniInbox } from "@/components/MiniInbox";
import { ContrastToy } from "@/components/ContrastToy";
import { GitHubMark, StarIcon } from "@/components/icons";
import { LookMiniature } from "@/components/mini";
import { LOOKS } from "@/lib/looks";
import { PRODUCT } from "@/config";

const MINIATURE_NOTES: Record<string, { note: string; category: string }> = {
  "strawberry-milk": { note: "Smoothie: banana, oat milk", category: "home" },
  matcha: { note: "Read: how FTS5 tokenises", category: "dev" },
  "lavender-haze": { note: "Sketch: sticker ideas", category: "ideas" },
  "midnight-grape": { note: "Draft the demo script", category: "work" },
  blueberry: { note: "Ship the type scale", category: "dev" },
  ink: { note: "Gather receipts, ugh", category: "life" },
};

const PLATFORMS: { key: "mac" | "windows" | "linux"; name: string }[] = [
  { key: "mac", name: "macOS" },
  { key: "windows", name: "Windows" },
  { key: "linux", name: "Linux" },
];

/** Stargazer count, fetched once at build time and baked into the static
    HTML. The page itself still makes no runtime requests to anyone; when
    the API is unreachable the count simply does not render. */
async function getStars(): Promise<number | null> {
  try {
    const res = await fetch("https://api.github.com/repos/worty76/Posthaste", {
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
  const stars = await getStars();

  return (
    <>
      <header className="page site-head">
        <a className="wordmark" href="/">
          Posthaste
        </a>
        <span className="site-head__spacer" />
        {stars !== null && (
          <a className="site-head__stars" href={`${PRODUCT.repoUrl}/stargazers`}>
            <StarIcon />
            {stars}
          </a>
        )}
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
              Press a shortcut anywhere, type, press Enter. The window is gone and the note waits in
              your inbox. Free, local, no account.
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
            Three beats, no wizard. The keys below match your system; the toggle shows the others.
          </p>
          <HowItWorks />
        </section>

        {/* 3. The inbox, with a small interactive sample. */}
        <section className="section" aria-labelledby="inbox-title">
          <h2 className="section__title" id="inbox-title">
            Your inbox, when you're ready
          </h2>
          <p className="section__lede">
            Notes land in the inbox. Today shows what you captured today; Archive keeps finished
            things out of the way but searchable. Search is instant full-text — prefixes match,
            accents don't matter.
          </p>
          <div className="inbox-grid">
            <MiniInbox />
            <div className="keys-legend">
              <h3>Try the keys</h3>
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
                <span>Filter</span>
                <span>
                  <kbd>/</kbd>
                </span>
              </div>
              <div className="keys-legend__row">
                <span>Clear filter</span>
                <span>
                  <kbd>esc</kbd>
                </span>
              </div>
              <p style={{ color: "var(--muted)", fontSize: "var(--t-sm)", margin: 0 }}>
                Every list in the app works this way. The sample notes are made up; yours never
                leave your machine.
              </p>
            </div>
          </div>
        </section>

        {/* 4. Looks: six live miniatures, make-your-own toy, share codes. */}
        <section className="section" aria-labelledby="looks-title">
          <h2 className="section__title" id="looks-title">
            Six looks. Make your own.
          </h2>
          <p className="section__lede">
            A look is four colours, a corner shape and a font style. These are the six that ship
            with the app — this page wears Ink.
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
            "Make your own" mixes four colours with a live preview and refuses anything hard to
            read. Try making the text faint:
          </p>
          <ContrastToy />
          <p className="section__lede" style={{ marginTop: 26, marginBottom: 0 }}>
            Looks travel as one line of text. A friend pastes it into{" "}
            <strong>Add from code…</strong> in their settings. No account, no upload; the code is
            checked for readability before anything applies.
          </p>
          <ShareCodeRow />
        </section>

        {/* 5. Privacy, stated as construction not promise. */}
        <section className="section" aria-labelledby="privacy-title">
          <h2 className="section__title" id="privacy-title">
            Private by construction
          </h2>
          <p className="section__lede">
            Not a promise about policy — a fact about how it is built. There is nothing to send
            anywhere.
          </p>
          <div className="privacy-grid">
            <div>
              <ul className="privacy-list privacy-list--no">
                <li>No account</li>
                <li>No network requests</li>
                <li>No telemetry or analytics</li>
                <li>No AI processing</li>
                <li>Logs never contain note text</li>
              </ul>
              <ul className="privacy-list privacy-list--yes" style={{ marginTop: 18 }}>
                <li>Notes, drafts and looks live in one SQLite file</li>
                <li>Export, import and backup are files you keep</li>
                <li>This page makes no third-party requests either</li>
              </ul>
            </div>
            <div>
              <h3 style={{ fontSize: "var(--t-md)", marginBottom: 8 }}>Where your notes live</h3>
              <div className="data-paths">
                <code>macOS: ~/Library/Application Support/dev.posthaste.desktop/posthaste.db</code>
                <code>Windows: %APPDATA%\dev.posthaste.desktop\posthaste.db</code>
                <code>Linux: ~/.local/share/dev.posthaste.desktop/posthaste.db</code>
              </div>
            </div>
          </div>
        </section>

        {/* 6. Under the hood, for developers. */}
        <section className="section" aria-labelledby="hood-title">
          <h2 className="section__title" id="hood-title">
            Under the hood
          </h2>
          <p className="section__lede">Four lines, because that is what it is.</p>
          <div className="hood">
            <span>
              <b>Rust, SQLite, Tauri 2</b> — a small desktop binary, no runtime to install.
            </span>
            <span>
              <b>WAL journal, synchronous=FULL</b> — "saved" means committed to disk.
            </span>
            <span>
              <b>SQLite FTS5</b> — instant prefix search that ignores accents.
            </span>
            <span>
              <b>Versioned migrations</b> — a snapshot is written before every upgrade; the trash
              empties after 24 hours.
            </span>
          </div>
        </section>

        {/* 7. Get it. */}
        <section className="section" aria-labelledby="get-title" id="get-it">
          <h2 className="section__title" id="get-title">
            Get it
          </h2>
          <p className="section__lede">
            Free. The installers arrive with the first release; until then, build from source.
          </p>
          <div className="get-grid">
            <div className="get-rows">
              {PLATFORMS.map((p) =>
                PRODUCT.downloads[p.key] ? (
                  <div className="get-row" key={p.key}>
                    <div>
                      <div className="get-row__name">{p.name}</div>
                    </div>
                    <a className="btn btn--primary" href={PRODUCT.downloads[p.key]!}>
                      Download
                    </a>
                  </div>
                ) : (
                  <div className="get-row" key={p.key}>
                    <div>
                      <div className="get-row__name">{p.name}</div>
                      <div className="get-row__note">Installer not out yet</div>
                    </div>
                    <a className="btn" href={`${PRODUCT.repoUrl}#readme`}>
                      Build from source
                    </a>
                  </div>
                ),
              )}
              <p className="early-note">
                Early release: tested on Linux; macOS and Windows builds are next.
              </p>
            </div>
            <div>
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
                The README in the repository walks through prerequisites per OS.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* 8. Footer. */}
      <footer className="page site-foot">
        <span>No analytics, no cookies, no third-party requests on this page.</span>
        <span>
          Posthaste {PRODUCT.version} · <a href={PRODUCT.repoUrl}>source</a>
        </span>
      </footer>
    </>
  );
}
