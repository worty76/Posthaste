//! Colour parsing and the small maths a look needs: WCAG contrast and
//! per-channel mixing. No other file in this crate touches colour values.

/// An sRGB colour. Only ever comes from `#rgb`/`#rrggbb` text via [`Rgb::parse`].
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Rgb {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

impl Rgb {
    /// Accepts `#rgb` or `#rrggbb`, any case. Nothing else parses, so a look
    /// file can never smuggle in a name, function or URL.
    pub fn parse(s: &str) -> Option<Rgb> {
        let hex = s.strip_prefix('#')?;
        if hex.is_empty() || !hex.bytes().all(|b| b.is_ascii_hexdigit()) {
            return None;
        }
        let d: Vec<u8> = hex
            .bytes()
            .map(|b| (b as char).to_digit(16).unwrap_or(0) as u8)
            .collect();
        match d.len() {
            3 => Some(Rgb {
                r: d[0] * 16 + d[0],
                g: d[1] * 16 + d[1],
                b: d[2] * 16 + d[2],
            }),
            6 => Some(Rgb {
                r: d[0] * 16 + d[1],
                g: d[2] * 16 + d[3],
                b: d[4] * 16 + d[5],
            }),
            _ => None,
        }
    }

    /// Lowercase `#rrggbb`, the form every derived token and preview uses.
    pub fn to_hex(self) -> String {
        format!("#{:02x}{:02x}{:02x}", self.r, self.g, self.b)
    }

    /// The colour as an `rgba()` string, for tokens that blend toward the text.
    pub fn to_rgba(self, alpha: f64) -> String {
        format!("rgba({}, {}, {}, {})", self.r, self.g, self.b, alpha)
    }
}

fn channel_luminance(c: u8) -> f64 {
    let c = f64::from(c) / 255.0;
    // WCAG 2.x: linearise sRGB below the 0.03928 threshold, gamma above it.
    if c <= 0.03928 {
        c / 12.92
    } else {
        ((c + 0.055) / 1.055).powf(2.4)
    }
}

/// WCAG 2.x relative luminance.
pub fn luminance(c: Rgb) -> f64 {
    0.2126 * channel_luminance(c.r)
        + 0.7152 * channel_luminance(c.g)
        + 0.0722 * channel_luminance(c.b)
}

/// WCAG contrast ratio, 1.0 to 21.0, symmetric in its arguments.
pub fn contrast(a: Rgb, b: Rgb) -> f64 {
    let (hi, lo) = if luminance(a) >= luminance(b) {
        (a, b)
    } else {
        (b, a)
    };
    (luminance(hi) + 0.05) / (luminance(lo) + 0.05)
}

/// Per-channel linear interpolation, rounded half up. `t` 0 gives `a`, 1 gives `b`.
pub fn mix(a: Rgb, b: Rgb, t: f64) -> Rgb {
    let blend = |x: u8, y: u8| ((f64::from(x) + (f64::from(y) - f64::from(x)) * t).round()) as u8;
    Rgb {
        r: blend(a.r, b.r),
        g: blend(a.g, b.g),
        b: blend(a.b, b.b),
    }
}
