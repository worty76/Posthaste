//! Derives the CSS custom-property map from a validated look document.
//! Deterministic: the same document always yields the same tokens, so golden
//! tests can pin every value. Loop steps use integer percents so results are
//! exact; `mix` rounds half up.

use std::collections::BTreeMap;

use serde::Serialize;

use crate::error::Result;
use crate::look::color::{contrast, mix, Rgb};
use crate::look::{Base, FontFace, LookDoc, Shape, TEXT_CONTRAST_MIN};

/// Faint text is for hints, so it only has to stay noticeable, not readable.
const FAINT_CONTRAST_MIN: f64 = 3.0;

const BLACK: Rgb = Rgb { r: 0, g: 0, b: 0 };
const WHITE: Rgb = Rgb {
    r: 255,
    g: 255,
    b: 255,
};

#[derive(Serialize, Clone, PartialEq, Debug)]
pub struct ResolvedLook {
    pub id: String,
    pub name: String,
    pub author: Option<String>,
    pub base: Base,
    pub shape: Shape,
    pub font: FontFace,
    pub tokens: BTreeMap<String, String>,
}

pub fn resolve(id: &str, doc: &LookDoc) -> Result<ResolvedLook> {
    doc.validate()?;
    let c = &doc.colors;
    let dark = doc.base == Base::Dark;
    let bg = parsed(&c.bg);
    let surface = parsed(&c.surface);
    let text = parsed(&c.text);
    let accent = parsed(&c.accent);

    let mut tokens = BTreeMap::new();
    tokens.insert("--bg".into(), bg.to_hex());
    tokens.insert("--surface".into(), surface.to_hex());
    tokens.insert("--text".into(), text.to_hex());
    tokens.insert("--accent".into(), accent.to_hex());
    sunken(&mut tokens, c, dark, bg);
    raised(&mut tokens, c, dark, surface);
    muted(&mut tokens, text, bg, surface);
    faint(&mut tokens, text, bg);
    borders(&mut tokens, text, dark);
    accent_ink(&mut tokens, accent, text, bg, surface);
    tokens.insert(
        "--accent-soft".into(),
        accent.to_rgba(if dark { 0.14 } else { 0.10 }),
    );
    tokens.insert("--on-accent".into(), on_accent(text, bg, accent).to_hex());
    overrides(&mut tokens, c);

    Ok(ResolvedLook {
        id: id.to_string(),
        name: doc.name.clone(),
        author: doc.author.clone(),
        base: doc.base,
        shape: doc.shape,
        font: doc.font,
        tokens,
    })
}

/// `validate` has accepted this string, so it always parses; the fallback is
/// unreachable and exists only because the compiler cannot see that.
fn parsed(s: &str) -> Rgb {
    Rgb::parse(s).unwrap_or(BLACK)
}

/// The sunken strip behind lists and fields.
fn sunken(tokens: &mut BTreeMap<String, String>, c: &crate::look::Colors, dark: bool, bg: Rgb) {
    let value = c
        .bg_sunken
        .as_deref()
        .and_then(Rgb::parse)
        .unwrap_or_else(|| mix(bg, BLACK, if dark { 0.18 } else { 0.04 }));
    tokens.insert("--bg-sunken".into(), value.to_hex());
}

/// Cards raised above the surface.
fn raised(
    tokens: &mut BTreeMap<String, String>,
    c: &crate::look::Colors,
    dark: bool,
    surface: Rgb,
) {
    let value = c
        .surface_raised
        .as_deref()
        .and_then(Rgb::parse)
        .unwrap_or_else(|| {
            if dark {
                mix(surface, WHITE, 0.03)
            } else {
                surface
            }
        });
    tokens.insert("--surface-raised".into(), value.to_hex());
}

/// Secondary text: as close to the background as it can get while keeping AA
/// contrast on both the background and the surface.
fn muted(tokens: &mut BTreeMap<String, String>, text: Rgb, bg: Rgb, surface: Rgb) {
    let value = (0..=38)
        .rev()
        .step_by(2)
        .map(|k| mix(text, bg, k as f64 / 100.0))
        .find(|&c| {
            contrast(c, bg) >= TEXT_CONTRAST_MIN && contrast(c, surface) >= TEXT_CONTRAST_MIN
        })
        .unwrap_or(text);
    tokens.insert("--text-muted".into(), value.to_hex());
}

/// Hints and timestamps.
fn faint(tokens: &mut BTreeMap<String, String>, text: Rgb, bg: Rgb) {
    let value = (0..=58)
        .rev()
        .step_by(2)
        .map(|k| mix(text, bg, k as f64 / 100.0))
        .find(|&c| contrast(c, bg) >= FAINT_CONTRAST_MIN)
        .unwrap_or(text);
    tokens.insert("--text-faint".into(), value.to_hex());
}

/// Hairlines, hover and active washes, all from the text colour.
fn borders(tokens: &mut BTreeMap<String, String>, text: Rgb, dark: bool) {
    let alphas: [(&str, f64); 4] = if dark {
        [
            ("--border", 0.08),
            ("--border-strong", 0.14),
            ("--hover", 0.05),
            ("--active", 0.08),
        ]
    } else {
        [
            ("--border", 0.10),
            ("--border-strong", 0.18),
            ("--hover", 0.045),
            ("--active", 0.08),
        ]
    };
    for (name, alpha) in alphas {
        tokens.insert(name.into(), text.to_rgba(alpha));
    }
}

/// The accent pulled toward the text until it is readable on the background,
/// the surface, and both tinted with 14% accent (where soft badges sit).
fn accent_ink(
    tokens: &mut BTreeMap<String, String>,
    accent: Rgb,
    text: Rgb,
    bg: Rgb,
    surface: Rgb,
) {
    let backgrounds = [
        bg,
        surface,
        mix(bg, accent, 0.14),
        mix(surface, accent, 0.14),
    ];
    let value = (0..=100)
        .step_by(2)
        .map(|k| mix(accent, text, k as f64 / 100.0))
        .find(|&c| {
            backgrounds
                .iter()
                .all(|&b| contrast(c, b) >= TEXT_CONTRAST_MIN)
        })
        .unwrap_or(text);
    tokens.insert("--accent-ink".into(), value.to_hex());
}

/// Text on accent fills. Black or white always has AA contrast with any
/// colour, so one of the candidates always works.
fn on_accent(text: Rgb, bg: Rgb, accent: Rgb) -> Rgb {
    [text, bg, BLACK, WHITE]
        .into_iter()
        .find(|&c| contrast(c, accent) >= TEXT_CONTRAST_MIN)
        .unwrap_or(BLACK)
}

/// Optional colours appear only when the look overrides them.
fn overrides(tokens: &mut BTreeMap<String, String>, c: &crate::look::Colors) {
    if let Some(danger) = c.danger.as_deref().and_then(Rgb::parse) {
        tokens.insert("--danger".into(), danger.to_hex());
        tokens.insert("--danger-soft".into(), danger.to_rgba(0.12));
    }
    if let Some(ok) = c.ok.as_deref().and_then(Rgb::parse) {
        tokens.insert("--ok".into(), ok.to_hex());
    }
}
