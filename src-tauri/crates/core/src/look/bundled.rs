//! The six looks that ship with the app, in gallery order. They are data:
//! parsed here, validated by the tests, never edited at runtime.

use crate::look::LookDoc;

const SOURCES: [(&str, &str); 6] = [
    (
        "strawberry-milk",
        include_str!("../../looks/strawberry-milk.json"),
    ),
    ("matcha", include_str!("../../looks/matcha.json")),
    (
        "lavender-haze",
        include_str!("../../looks/lavender-haze.json"),
    ),
    (
        "midnight-grape",
        include_str!("../../looks/midnight-grape.json"),
    ),
    ("blueberry", include_str!("../../looks/blueberry.json")),
    ("ink", include_str!("../../looks/ink.json")),
];

/// `(id, doc)` pairs with ids `builtin:<slug>`, bundled looks first in
/// gallery order. A file that no longer parses is skipped and logged rather
/// than breaking the app; the bundled-look tests are what catch that.
pub fn bundled() -> Vec<(String, LookDoc)> {
    SOURCES
        .iter()
        .filter_map(|(slug, json)| match serde_json::from_str::<LookDoc>(json) {
            Ok(doc) => Some((format!("builtin:{slug}"), doc)),
            Err(e) => {
                log::error!("bundled look {slug} does not parse: {e}");
                None
            }
        })
        .collect()
}
