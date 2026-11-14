//! Share codes: a look as one line of text, `posthaste-look:1:` plus
//! unpadded base64url of the compact JSON. Decoding tolerates what chat apps
//! do to pasted text; base64 is hand-written because new dependencies need
//! approval and the alphabet is twenty lines.

use crate::error::{CoreError, Result};
use crate::look::LookDoc;

pub const CODE_PREFIX: &str = "posthaste-look:1:";

/// Bound on the whole pasted line, so a huge paste is refused before any of
/// it is decoded.
const MAX_CODE_BYTES: usize = 8192;

const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/// Unpadded base64url.
pub(super) fn b64_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b0 = u32::from(chunk[0]);
        let b1 = u32::from(*chunk.get(1).unwrap_or(&0));
        let b2 = u32::from(*chunk.get(2).unwrap_or(&0));
        let n = (b0 << 16) | (b1 << 8) | b2;
        let chars = [(n >> 18) & 63, (n >> 12) & 63, (n >> 6) & 63, n & 63];
        let keep = match chunk.len() {
            1 => 2,
            2 => 3,
            _ => 4,
        };
        for c in chars.iter().take(keep) {
            out.push(ALPHABET[*c as usize] as char);
        }
    }
    out
}

/// Inverse of [`b64_encode`]. `None` for anything with wrong length or a
/// character outside the url-safe alphabet.
pub(super) fn b64_decode(s: &str) -> Option<Vec<u8>> {
    if s.is_empty() {
        return Some(Vec::new());
    }
    let mut vals = Vec::with_capacity(s.len());
    for ch in s.bytes() {
        let v = match ch {
            b'A'..=b'Z' => ch - b'A',
            b'a'..=b'z' => ch - b'a' + 26,
            b'0'..=b'9' => ch - b'0' + 52,
            b'-' => 62,
            b'_' => 63,
            _ => return None,
        };
        vals.push(v);
    }
    // Length 1 mod 4 carries no whole byte; 0, 2 and 3 are fine.
    if vals.len() % 4 == 1 {
        return None;
    }
    let mut out = Vec::with_capacity(vals.len() * 3 / 4);
    for chunk in vals.chunks(4) {
        let v = |i: usize| u32::from(chunk.get(i).copied().unwrap_or(0));
        let n = (v(0) << 18) | (v(1) << 12) | (v(2) << 6) | v(3);
        let keep = match chunk.len() {
            2 => 1,
            3 => 2,
            _ => 3,
        };
        for i in 0..keep {
            out.push(((n >> (16 - 8 * i)) & 0xff) as u8);
        }
    }
    Some(out)
}

/// The share code for a look.
pub fn encode_code(doc: &LookDoc) -> String {
    format!("{CODE_PREFIX}{}", b64_encode(doc.to_json().as_bytes()))
}

/// Reads a share code, or a raw JSON document, into a validated look.
fn incomplete() -> CoreError {
    CoreError::InvalidLook(
        "That code looks incomplete, or it changed when it was copied. Ask for it again.".into(),
    )
}

pub fn decode_code(input: &str) -> Result<LookDoc> {
    if input.len() > MAX_CODE_BYTES {
        return Err(CoreError::InvalidLook(
            "That code is too large to be a look.".into(),
        ));
    }
    let s = strip_wrapping(input.trim());
    if s.starts_with('{') {
        return LookDoc::from_json(s);
    }
    // A different version is a different, clearer message than "malformed".
    if s.starts_with("posthaste-look:") && !s.starts_with(CODE_PREFIX) {
        return Err(CoreError::InvalidLook(
            "This look was made with a newer version of Posthaste. Update the app to use it."
                .into(),
        ));
    }
    let Some(payload) = s.strip_prefix(CODE_PREFIX) else {
        return Err(CoreError::InvalidLook(
            "That doesn't look like a look code. It should start with \"posthaste-look:1:\"."
                .into(),
        ));
    };
    let compact: String = payload.chars().filter(|c| !c.is_whitespace()).collect();
    let bytes = b64_decode(&compact).ok_or_else(incomplete)?;
    let json = String::from_utf8(bytes).map_err(|_| incomplete())?;
    let doc: LookDoc = serde_json::from_str(&json).map_err(|_| incomplete())?;
    doc.validate()?;
    Ok(doc)
}

/// Chat apps wrap pasted text in quotes or backticks; take one layer off.
fn strip_wrapping(s: &str) -> &str {
    let b = s.as_bytes();
    if b.len() >= 2 {
        let (first, last) = (b[0], b[b.len() - 1]);
        if (first == b'"' && last == b'"') || (first == b'`' && last == b'`') {
            return &s[1..s.len() - 1];
        }
    }
    s
}
