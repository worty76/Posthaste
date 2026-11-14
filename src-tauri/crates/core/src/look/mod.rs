//! Looks: a small colour document, validated and turned into CSS tokens here
//! in Rust; the UI only applies the result. Validation lives here and nowhere
//! else, so a look can never reach the DOM unchecked.

pub mod bundled;
pub mod code;
pub mod color;
pub mod derive;

#[cfg(test)]
mod tests;

use serde::{Deserialize, Serialize};

use crate::error::{CoreError, Result};
use color::{contrast, Rgb};

pub const LOOK_FORMAT: &str = "posthaste-look";
pub const LOOK_VERSION: u32 = 1;
pub const MAX_NAME_CHARS: usize = 40;
pub const MAX_DOC_BYTES: usize = 4096;
pub const MAX_USER_LOOKS: usize = 50;
/// Text on the background or surface must stay readable (WCAG AA).
pub const TEXT_CONTRAST_MIN: f64 = 4.5;
/// The accent only has to stand out as a fill, not be read as text.
pub const ACCENT_FILL_MIN: f64 = 1.3;

/// Which built-in token set the look sits on: everything it does not set
/// comes from the light or the dark block in `tokens.css`.
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Base {
    Light,
    Dark,
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug, Default)]
#[serde(rename_all = "lowercase")]
pub enum Shape {
    Sharp,
    #[default]
    Soft,
    Round,
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug, Default)]
#[serde(rename_all = "lowercase")]
pub enum FontFace {
    #[default]
    System,
    Rounded,
    Serif,
    Mono,
}

/// The look's colours. Raw hex only; anything else is rejected by
/// [`LookDoc::validate`].
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
#[serde(deny_unknown_fields)]
pub struct Colors {
    pub bg: String,
    pub surface: String,
    pub text: String,
    pub accent: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bg_sunken: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub surface_raised: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub danger: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ok: Option<String>,
}

/// A look document, exactly what version 1 of the format allows. Unknown
/// fields anywhere reject the whole look.
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
#[serde(deny_unknown_fields)]
pub struct LookDoc {
    pub format: String,
    pub version: u32,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    pub base: Base,
    pub colors: Colors,
    #[serde(default)]
    pub shape: Shape,
    #[serde(default)]
    pub font: FontFace,
}

/// Normalized hex of the four main colours, for gallery cards.
#[derive(Serialize, Clone, PartialEq, Eq, Debug)]
pub struct LookPreview {
    pub bg: String,
    pub surface: String,
    pub text: String,
    pub accent: String,
}

fn parse_color(field: &str, value: &str) -> Result<Rgb> {
    Rgb::parse(value).ok_or_else(|| {
        let shown: String = value.chars().take(20).collect();
        CoreError::InvalidLook(format!(
            "Color \"{field}\" must look like #rrggbb or #rgb, not \"{shown}\"."
        ))
    })
}

impl LookDoc {
    /// All checks in order, first failure wins; nothing is partly applied.
    pub fn validate(&self) -> Result<()> {
        if self.format != LOOK_FORMAT {
            return Err(CoreError::InvalidLook(
                "This isn't a Posthaste look file.".into(),
            ));
        }
        if self.version > LOOK_VERSION {
            return Err(CoreError::InvalidLook(format!(
                "This look was made with a newer version of Posthaste (format {v}). \
                 Update the app to use it.",
                v = self.version
            )));
        }
        if self.version < LOOK_VERSION {
            return Err(CoreError::InvalidLook(
                "This isn't a Posthaste look file.".into(),
            ));
        }

        if self.name.trim().is_empty() {
            return Err(CoreError::InvalidLook("Give the look a name.".into()));
        }
        if self.name.chars().count() > MAX_NAME_CHARS {
            return Err(CoreError::InvalidLook(format!(
                "The name can be at most {MAX_NAME_CHARS} characters."
            )));
        }
        if self.name.chars().any(|c| c.is_control()) {
            return Err(CoreError::InvalidLook(
                "The name can't contain control characters.".into(),
            ));
        }
        if let Some(author) = &self.author {
            if author.chars().count() > MAX_NAME_CHARS {
                return Err(CoreError::InvalidLook(format!(
                    "The author name can be at most {MAX_NAME_CHARS} characters."
                )));
            }
            if author.chars().any(|c| c.is_control()) {
                return Err(CoreError::InvalidLook(
                    "The author name can't contain control characters.".into(),
                ));
            }
        }

        let bg = parse_color("bg", &self.colors.bg)?;
        let surface = parse_color("surface", &self.colors.surface)?;
        let text = parse_color("text", &self.colors.text)?;
        let accent = parse_color("accent", &self.colors.accent)?;
        for (field, value) in [
            ("bg_sunken", &self.colors.bg_sunken),
            ("surface_raised", &self.colors.surface_raised),
            ("danger", &self.colors.danger),
            ("ok", &self.colors.ok),
        ] {
            if let Some(v) = value {
                parse_color(field, v)?;
            }
        }

        if contrast(text, bg) < TEXT_CONTRAST_MIN {
            return Err(CoreError::InvalidLook(format!(
                "Text and background are too similar to read comfortably ({:.1}:1, \
                 needs {:.1}:1).",
                contrast(text, bg),
                TEXT_CONTRAST_MIN
            )));
        }
        if contrast(text, surface) < TEXT_CONTRAST_MIN {
            return Err(CoreError::InvalidLook(format!(
                "Text and surface are too similar to read comfortably ({:.1}:1, \
                 needs {:.1}:1).",
                contrast(text, surface),
                TEXT_CONTRAST_MIN
            )));
        }
        if contrast(accent, bg) < ACCENT_FILL_MIN {
            return Err(CoreError::InvalidLook(
                "The accent is almost invisible on the background. \
                 Pick a color that stands out more."
                    .into(),
            ));
        }
        Ok(())
    }

    /// Parses and validates. The size limit comes first: a huge blob is
    /// refused before any of it is processed.
    pub fn from_json(json: &str) -> Result<LookDoc> {
        if json.len() > MAX_DOC_BYTES {
            return Err(CoreError::InvalidLook(format!(
                "That look file is too large. The limit is {MAX_DOC_BYTES} bytes."
            )));
        }
        let doc: LookDoc = serde_json::from_str(json)
            .map_err(|e| CoreError::InvalidLook(format!("That isn't a valid look: {e}")))?;
        doc.validate()?;
        Ok(doc)
    }

    /// Compact JSON, the form stored and shared.
    pub fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap_or_default()
    }

    pub fn preview(&self) -> LookPreview {
        let hex = |s: &str| Rgb::parse(s).map(Rgb::to_hex).unwrap_or_default();
        LookPreview {
            bg: hex(&self.colors.bg),
            surface: hex(&self.colors.surface),
            text: hex(&self.colors.text),
            accent: hex(&self.colors.accent),
        }
    }
}
