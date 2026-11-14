//! Tests for the look module: colour maths, validation, derivation, share
//! codes, bundled looks and storage.

use crate::look::{Base, Colors, FontFace, LookDoc, Shape};

/// The Strawberry Milk look from the design spec, as a document.
fn doc() -> LookDoc {
    LookDoc {
        format: "posthaste-look".into(),
        version: 1,
        name: "Strawberry Milk".into(),
        author: Some("Posthaste".into()),
        base: Base::Light,
        colors: Colors {
            bg: "#fff5f7".into(),
            surface: "#ffffff".into(),
            text: "#4a2c3a".into(),
            accent: "#ff8fb1".into(),
            bg_sunken: None,
            surface_raised: None,
            danger: None,
            ok: None,
        },
        shape: Shape::Round,
        font: FontFace::Rounded,
    }
}

mod color_tests {
    use crate::look::color::{contrast, mix, Rgb};

    #[test]
    fn parses_three_digit_and_mixed_case_hex() {
        assert_eq!(
            Rgb::parse("#fff"),
            Some(Rgb {
                r: 255,
                g: 255,
                b: 255
            })
        );
        assert_eq!(
            Rgb::parse("#FF8fB1"),
            Some(Rgb {
                r: 255,
                g: 143,
                b: 177
            })
        );
    }

    #[test]
    fn rejects_everything_but_hex_short_or_long() {
        for bad in [
            "",
            "fff",
            "#ffff",
            "#ggg",
            "#fff5f780",
            "rgb(1,2,3)",
            "red",
            "#fff ",
            "url(x)",
        ] {
            assert_eq!(Rgb::parse(bad), None, "expected {bad:?} to be rejected");
        }
    }

    #[test]
    fn white_on_black_is_21_to_1_and_contrast_is_symmetric() {
        let white = Rgb {
            r: 255,
            g: 255,
            b: 255,
        };
        let black = Rgb { r: 0, g: 0, b: 0 };
        assert!((contrast(white, black) - 21.0).abs() < 1e-9);
        let pink = Rgb {
            r: 255,
            g: 143,
            b: 177,
        };
        assert_eq!(contrast(pink, pink), 1.0);
        assert_eq!(contrast(white, black), contrast(black, white));
    }

    #[test]
    fn mixing_halfway_between_black_and_white_gives_128() {
        let black = Rgb { r: 0, g: 0, b: 0 };
        let white = Rgb {
            r: 255,
            g: 255,
            b: 255,
        };
        assert_eq!(
            mix(black, white, 0.5),
            Rgb {
                r: 128,
                g: 128,
                b: 128
            }
        );
        assert_eq!(mix(black, white, 0.0), black);
        assert_eq!(mix(black, white, 1.0), white);
    }

    #[test]
    fn formats_as_hex_and_rgba() {
        let pink = Rgb {
            r: 255,
            g: 143,
            b: 177,
        };
        assert_eq!(pink.to_hex(), "#ff8fb1");
        assert_eq!(
            Rgb {
                r: 74,
                g: 44,
                b: 58
            }
            .to_rgba(0.045),
            "rgba(74, 44, 58, 0.045)"
        );
        assert_eq!(Rgb { r: 0, g: 0, b: 0 }.to_rgba(0.1), "rgba(0, 0, 0, 0.1)");
    }
}

mod validation_tests {
    use super::doc;
    use crate::look::LookDoc;

    fn assert_invalid(d: &LookDoc, needle: &str) {
        let err = d.validate().unwrap_err().to_string();
        assert!(
            err.contains(needle),
            "expected {needle:?} in the message, got: {err}"
        );
    }

    #[test]
    fn the_strawberry_milk_document_is_valid() {
        assert!(doc().validate().is_ok());
    }

    #[test]
    fn uppercase_three_digit_hex_is_accepted() {
        let mut d = doc();
        d.colors.bg = "#FFF".into();
        assert!(d.validate().is_ok());
    }

    #[test]
    fn a_foreign_format_is_rejected() {
        let mut d = doc();
        d.format = "other".into();
        assert_invalid(&d, "isn't a Posthaste look");
    }

    #[test]
    fn a_newer_version_is_rejected() {
        let mut d = doc();
        d.version = 2;
        assert_invalid(&d, "newer version");
    }

    #[test]
    fn blank_names_are_rejected() {
        let mut d = doc();
        d.name = "".into();
        assert_invalid(&d, "Give the look a name");
        d.name = "   ".into();
        assert_invalid(&d, "Give the look a name");
    }

    #[test]
    fn names_over_forty_characters_are_rejected() {
        let mut d = doc();
        d.name = "x".repeat(41);
        assert_invalid(&d, "at most 40 characters");
    }

    #[test]
    fn names_with_control_characters_are_rejected() {
        let mut d = doc();
        d.name = "a\nb".into();
        assert_invalid(&d, "control characters");
    }

    #[test]
    fn emoji_and_accented_names_pass_and_the_limit_counts_characters() {
        let mut d = doc();
        d.name = "🍓 Strawberry".into();
        assert!(d.validate().is_ok());
        d.name = "🍓".repeat(40);
        assert!(d.validate().is_ok());
        d.name = "🍓".repeat(41);
        assert_invalid(&d, "at most 40 characters");
    }

    #[test]
    fn a_long_author_name_is_rejected() {
        let mut d = doc();
        d.author = Some("x".repeat(41));
        assert_invalid(&d, "author name can be at most 40");
    }

    #[test]
    fn only_hex_colours_are_accepted() {
        for bad in ["red", "#ff8fb1ff", "rgb(1,2,3)", "url(x)"] {
            let mut d = doc();
            d.colors.bg = bad.into();
            let err = d.validate().unwrap_err().to_string();
            assert!(err.contains("Color \"bg\""), "got: {err}");
            assert!(err.contains(bad), "got: {err}");
        }
    }

    #[test]
    fn text_matching_the_background_is_rejected_with_the_ratio() {
        let mut d = doc();
        d.colors.text = d.colors.bg.clone();
        let err = d.validate().unwrap_err().to_string();
        assert!(err.contains("too similar to read"), "got: {err}");
        assert!(err.contains("1.0:1"), "got: {err}");
    }

    #[test]
    fn text_matching_the_surface_is_rejected() {
        let mut d = doc();
        d.colors.bg = "#222222".into();
        d.colors.text = "#ffffff".into();
        d.colors.surface = "#ffffff".into();
        assert_invalid(&d, "Text and surface");
    }

    #[test]
    fn an_accent_invisible_on_the_background_is_rejected() {
        let mut d = doc();
        d.colors.accent = d.colors.bg.clone();
        assert_invalid(&d, "almost invisible");
    }

    #[test]
    fn an_unknown_field_rejects_the_whole_look() {
        let err = LookDoc::from_json(
            r##"{"format":"posthaste-look","version":1,"name":"x","base":"light",
                "colors":{"bg":"#ffffff","surface":"#ffffff","text":"#000000","accent":"#000000"},
                "extra":true}"##,
        )
        .unwrap_err()
        .to_string();
        assert!(err.contains("unknown field"), "got: {err}");
    }

    #[test]
    fn an_unknown_colour_field_rejects_the_whole_look() {
        let err = LookDoc::from_json(
            r##"{"format":"posthaste-look","version":1,"name":"x","base":"light",
                "colors":{"bg":"#ffffff","surface":"#ffffff","text":"#000000","accent":"#000000","glow":"#ffffff"}}"##,
        )
        .unwrap_err()
        .to_string();
        assert!(err.contains("unknown field"), "got: {err}");
    }

    #[test]
    fn a_missing_accent_rejects_the_look() {
        assert!(LookDoc::from_json(
            r##"{"format":"posthaste-look","version":1,"name":"x","base":"light",
                "colors":{"bg":"#ffffff","surface":"#ffffff","text":"#000000"}}"##,
        )
        .is_err());
    }

    #[test]
    fn a_document_over_4096_bytes_is_too_large() {
        let mut d = doc();
        d.name = "y".repeat(5000);
        let err = LookDoc::from_json(&d.to_json()).unwrap_err().to_string();
        assert!(err.contains("too large"), "got: {err}");
    }

    #[test]
    fn to_json_round_trips_and_omits_missing_colours() {
        let d = doc();
        let json = d.to_json();
        assert_eq!(LookDoc::from_json(&json).unwrap(), d);
        assert!(!json.contains("danger"));
        assert!(!json.contains("bg_sunken"));

        let mut with_optional = doc();
        with_optional.colors.danger = Some("#ff0000".into());
        let json = with_optional.to_json();
        assert!(json.contains("danger"));
        assert_eq!(LookDoc::from_json(&json).unwrap(), with_optional);
    }
}
