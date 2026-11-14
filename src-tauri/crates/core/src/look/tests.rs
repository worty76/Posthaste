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

mod derive_tests {
    use super::doc;
    use crate::look::color::contrast;
    use crate::look::derive::{resolve, ResolvedLook};
    use crate::look::{Base, Colors, FontFace, LookDoc, Shape, TEXT_CONTRAST_MIN};
    use crate::CoreError;

    fn midnight() -> LookDoc {
        LookDoc {
            format: "posthaste-look".into(),
            version: 1,
            name: "Midnight Grape".into(),
            author: Some("Posthaste".into()),
            base: Base::Dark,
            colors: Colors {
                bg: "#1a1423".into(),
                surface: "#241b31".into(),
                text: "#f1e9ff".into(),
                accent: "#c58bff".into(),
                bg_sunken: None,
                surface_raised: None,
                danger: None,
                ok: None,
            },
            shape: Shape::Round,
            font: FontFace::Rounded,
        }
    }

    fn tokens(d: &LookDoc) -> std::collections::BTreeMap<String, String> {
        resolve("test", d).unwrap().tokens
    }

    #[test]
    fn the_light_golden_look_derives_exactly_these_tokens() {
        let t = tokens(&doc());
        let expected: [(&str, &str); 15] = [
            ("--bg", "#fff5f7"),
            ("--surface", "#ffffff"),
            ("--text", "#4a2c3a"),
            ("--accent", "#ff8fb1"),
            ("--bg-sunken", "#f5ebed"),
            ("--surface-raised", "#ffffff"),
            ("--text-muted", "#806873"),
            ("--text-faint", "#9d8891"),
            ("--border", "rgba(74, 44, 58, 0.1)"),
            ("--border-strong", "rgba(74, 44, 58, 0.18)"),
            ("--hover", "rgba(74, 44, 58, 0.045)"),
            ("--active", "rgba(74, 44, 58, 0.08)"),
            ("--accent-ink", "#96566c"),
            ("--accent-soft", "rgba(255, 143, 177, 0.1)"),
            ("--on-accent", "#4a2c3a"),
        ];
        assert_eq!(t.len(), expected.len(), "exactly the derived tokens");
        for (k, v) in expected {
            assert_eq!(t.get(k), Some(&v.to_string()), "{k}");
        }
    }

    #[test]
    fn the_dark_golden_look_derives_exactly_these_tokens() {
        let t = tokens(&midnight());
        let expected: [(&str, &str); 15] = [
            ("--bg", "#1a1423"),
            ("--surface", "#241b31"),
            ("--text", "#f1e9ff"),
            ("--accent", "#c58bff"),
            ("--bg-sunken", "#15101d"),
            ("--surface-raised", "#2b2237"),
            ("--text-muted", "#9f98ab"),
            ("--text-faint", "#746d7f"),
            ("--border", "rgba(241, 233, 255, 0.08)"),
            ("--border-strong", "rgba(241, 233, 255, 0.14)"),
            ("--hover", "rgba(241, 233, 255, 0.05)"),
            ("--active", "rgba(241, 233, 255, 0.08)"),
            ("--accent-ink", "#c58bff"),
            ("--accent-soft", "rgba(197, 139, 255, 0.14)"),
            ("--on-accent", "#1a1423"),
        ];
        assert_eq!(t.len(), expected.len(), "exactly the derived tokens");
        for (k, v) in expected {
            assert_eq!(t.get(k), Some(&v.to_string()), "{k}");
        }
    }

    #[test]
    fn the_resolved_look_carries_its_identity() {
        let r: ResolvedLook = resolve("builtin:ink", &doc()).unwrap();
        assert_eq!(r.id, "builtin:ink");
        assert_eq!(r.name, "Strawberry Milk");
        assert_eq!(r.author.as_deref(), Some("Posthaste"));
        assert_eq!(r.base, Base::Light);
        assert_eq!(r.shape, Shape::Round);
        assert_eq!(r.font, FontFace::Rounded);
    }

    #[test]
    fn optional_colours_only_appear_when_overridden() {
        let d = doc();
        let t = tokens(&d);
        for absent in ["--danger", "--danger-soft", "--ok"] {
            assert!(!t.contains_key(absent), "{absent} without an override");
        }

        let mut d = doc();
        d.colors.danger = Some("#ff0000".into());
        d.colors.ok = Some("#00ff00".into());
        d.colors.bg_sunken = Some("#123456".into());
        let t = tokens(&d);
        assert_eq!(t.get("--danger").unwrap(), "#ff0000");
        assert_eq!(t.get("--danger-soft").unwrap(), "rgba(255, 0, 0, 0.12)");
        assert_eq!(t.get("--ok").unwrap(), "#00ff00");
        assert_eq!(t.get("--bg-sunken").unwrap(), "#123456");
    }

    #[test]
    fn colours_are_normalised_to_lowercase_six_digit_hex() {
        let mut d = doc();
        d.colors.bg = "#FFF".into();
        d.colors.accent = "#FF8FB1".into();
        let t = tokens(&d);
        assert_eq!(t.get("--bg").unwrap(), "#ffffff");
        assert_eq!(t.get("--accent").unwrap(), "#ff8fb1");
    }

    #[test]
    fn an_invalid_document_is_rejected_without_tokens() {
        let mut d = doc();
        d.colors.text = d.colors.bg.clone();
        let err = resolve("test", &d).unwrap_err();
        assert!(matches!(err, CoreError::InvalidLook(_)));
    }

    /// A small linear congruential generator so the property test is
    /// deterministic without a `rand` dependency.
    struct Lcg(u64);

    impl Lcg {
        fn next_u32(&mut self) -> u32 {
            self.0 = self
                .0
                .wrapping_mul(6_364_136_223_846_793_005)
                .wrapping_add(1_442_695_040_888_963_407);
            (self.0 >> 33) as u32
        }

        /// A channel value in `lo..lo+span`.
        fn channel(&mut self, lo: u8, span: u8) -> u8 {
            lo + (self.next_u32() % u32::from(span)) as u8
        }

        fn color(&mut self, lo: u8, span: u8) -> [u8; 3] {
            [
                self.channel(lo, span),
                self.channel(lo, span),
                self.channel(lo, span),
            ]
        }
    }

    fn hex(c: [u8; 3]) -> String {
        format!("#{:02x}{:02x}{:02x}", c[0], c[1], c[2])
    }

    #[test]
    fn derived_tokens_stay_readable_for_300_generated_colour_sets() {
        let mut rng = Lcg(0x5EED_1234_ABCD_0001);
        let mut checked = 0;
        for i in 0..300 {
            let dark = i % 2 == 1;
            let (bg_lo, bg_span, text_lo, text_span) = if dark {
                (0, 40, 210, 46)
            } else {
                (216, 40, 0, 70)
            };
            let bg = rng.color(bg_lo, bg_span);
            let text = rng.color(text_lo, text_span);
            let mut surface = [
                bg[0].saturating_add(rng.channel(0, 8)),
                bg[1].saturating_add(rng.channel(0, 8)),
                bg[2].saturating_add(rng.channel(0, 8)),
            ];
            if !dark {
                // A light surface must stay bright or text contrast breaks.
                surface[0] = surface[0].max(bg[0]);
                surface[1] = surface[1].max(bg[1]);
                surface[2] = surface[2].max(bg[2]);
            }
            let accent = rng.color(0, 255);
            let d = LookDoc {
                format: "posthaste-look".into(),
                version: 1,
                name: "Property".into(),
                author: None,
                base: if dark { Base::Dark } else { Base::Light },
                colors: Colors {
                    bg: hex(bg),
                    surface: hex(surface),
                    text: hex(text),
                    accent: hex(accent),
                    bg_sunken: None,
                    surface_raised: None,
                    danger: None,
                    ok: None,
                },
                shape: Shape::Soft,
                font: FontFace::System,
            };
            let Ok(r) = resolve("test", &d) else {
                continue; // accent or surface out of range: not a valid look
            };
            checked += 1;
            let get = |k: &str| r.tokens.get(k).unwrap().clone();
            let hex_of =
                |s: &str| crate::look::color::Rgb::parse(s).expect("tokens are parsed colours");
            let muted = hex_of(&get("--text-muted"));
            let ink = hex_of(&get("--accent-ink"));
            assert!(
                contrast(muted, bg_rgb(&r)) >= TEXT_CONTRAST_MIN,
                "muted on bg, set {i}"
            );
            assert!(
                contrast(muted, surface_rgb(&r)) >= TEXT_CONTRAST_MIN,
                "muted on surface, set {i}"
            );
            assert!(
                contrast(ink, bg_rgb(&r)) >= TEXT_CONTRAST_MIN,
                "ink on bg, set {i}"
            );
            assert!(
                contrast(ink, surface_rgb(&r)) >= TEXT_CONTRAST_MIN,
                "ink on surface, set {i}"
            );
            assert!(
                contrast(hex_of(&get("--on-accent")), hex_of(&get("--accent")))
                    >= TEXT_CONTRAST_MIN,
                "on-accent on accent, set {i}"
            );
            for v in r.tokens.values() {
                assert!(
                    v.starts_with('#') || v.starts_with("rgba("),
                    "token value {v:?}"
                );
            }
            let again = resolve("test", &d).unwrap();
            assert_eq!(again, r, "resolve is deterministic, set {i}");
        }
        assert!(checked > 0, "the generator produced valid sets");
    }

    fn bg_rgb(r: &ResolvedLook) -> crate::look::color::Rgb {
        crate::look::color::Rgb::parse(r.tokens.get("--bg").unwrap()).unwrap()
    }

    fn surface_rgb(r: &ResolvedLook) -> crate::look::color::Rgb {
        crate::look::color::Rgb::parse(r.tokens.get("--surface").unwrap()).unwrap()
    }
}

mod code_tests {
    use super::doc;
    use crate::look::code::{b64_decode, b64_encode, decode_code, encode_code, CODE_PREFIX};

    fn coded() -> String {
        encode_code(&doc())
    }

    #[test]
    fn base64_round_trips_every_length_up_to_forty() {
        let bytes: Vec<u8> = (0..=255u8).cycle().take(41).collect();
        for len in 0..=40usize {
            let input = &bytes[..len];
            let encoded = b64_encode(input);
            assert!(
                !encoded.contains('+') && !encoded.contains('/') && !encoded.contains('='),
                "url-safe without padding: {encoded:?}"
            );
            assert_eq!(b64_decode(&encoded).as_deref(), Some(input), "length {len}");
        }
    }

    #[test]
    fn base64_rejects_wrong_lengths_and_the_standard_alphabet() {
        assert_eq!(b64_decode("a"), None);
        assert_eq!(b64_decode("a+b"), None);
    }

    #[test]
    fn a_code_encodes_and_decodes_back_to_the_same_document() {
        let code = coded();
        assert!(code.starts_with(CODE_PREFIX));
        assert_eq!(decode_code(&code).unwrap(), doc());
    }

    #[test]
    fn the_code_survives_what_chat_apps_do_to_text() {
        let code = coded();
        let mut wrapped = String::new();
        for (i, c) in code.chars().enumerate() {
            wrapped.push(c);
            if (i + 1) % 20 == 0 {
                wrapped.push(' ');
            }
            if (i + 1) % 40 == 0 {
                wrapped.push('\n');
            }
        }
        assert_eq!(decode_code(&wrapped).unwrap(), doc());
        assert_eq!(decode_code(&format!("\"{code}\"")).unwrap(), doc());
        assert_eq!(decode_code(&format!("`{code}`")).unwrap(), doc());
        assert_eq!(decode_code(&format!("  \n{code}  \n")).unwrap(), doc());
        assert_eq!(decode_code(&doc().to_json()).unwrap(), doc());
    }

    #[test]
    fn a_cut_off_code_reports_incomplete() {
        let cut = &coded()[..coded().len() - 10];
        let err = decode_code(cut).unwrap_err().to_string();
        assert!(err.contains("incomplete"), "got: {err}");
    }

    #[test]
    fn something_else_entirely_reports_the_missing_prefix() {
        let err = decode_code("hello").unwrap_err().to_string();
        assert!(err.contains("posthaste-look:1:"), "got: {err}");
    }

    #[test]
    fn a_code_from_a_newer_version_reports_just_that() {
        let err = decode_code("posthaste-look:2:AAAA")
            .unwrap_err()
            .to_string();
        assert!(err.contains("newer version"), "got: {err}");
    }

    #[test]
    fn an_oversized_input_is_too_large() {
        let big = format!("{CODE_PREFIX}{}", "A".repeat(9000));
        let err = decode_code(&big).unwrap_err().to_string();
        assert!(err.contains("too large"), "got: {err}");
    }

    #[test]
    fn a_code_for_an_unreadable_look_shows_the_validation_message() {
        let mut bad = doc();
        bad.colors.text = bad.colors.bg.clone();
        let err = decode_code(&encode_code(&bad)).unwrap_err().to_string();
        assert!(err.contains("too similar to read"), "got: {err}");
        assert!(!err.contains("incomplete"), "got: {err}");
    }

    #[test]
    fn every_bundled_look_round_trips_through_its_code() {
        for (id, d) in crate::look::bundled::bundled() {
            assert_eq!(decode_code(&encode_code(&d)).unwrap(), d, "{id}");
        }
    }
}

mod bundled_tests {
    use crate::look::bundled::bundled;
    use crate::look::code::{decode_code, encode_code};
    use crate::look::derive::resolve;

    #[test]
    fn the_six_bundled_looks_ship_in_gallery_order() {
        let looks = bundled();
        let ids: Vec<&str> = looks.iter().map(|(id, _)| id.as_str()).collect();
        assert_eq!(
            ids,
            [
                "builtin:strawberry-milk",
                "builtin:matcha",
                "builtin:lavender-haze",
                "builtin:midnight-grape",
                "builtin:blueberry",
                "builtin:ink",
            ]
        );
    }

    #[test]
    fn every_bundled_look_is_valid_resolves_and_has_a_unique_name() {
        let looks = bundled();
        for (id, d) in &looks {
            if let Err(e) = d.validate() {
                panic!("{id} fails validation: {e}");
            }
            if let Err(e) = resolve(id, d) {
                panic!("{id} fails to resolve: {e}");
            }
        }
        let mut names: Vec<&str> = looks.iter().map(|(_, d)| d.name.as_str()).collect();
        names.sort();
        let unique = names.len() == names.iter().len() && names.windows(2).all(|w| w[0] != w[1]);
        assert!(unique, "names are unique: {names:?}");
    }

    #[test]
    fn the_ink_accent_stays_dark_enough_for_its_own_text() {
        let ink = bundled()
            .into_iter()
            .find(|(id, _)| id == "builtin:ink")
            .map(|(_, d)| d)
            .expect("ink ships with the app");
        let tokens = resolve("builtin:ink", &ink).unwrap().tokens;
        assert_eq!(tokens.get("--on-accent").unwrap(), "#0f0f0f");
    }

    #[test]
    fn every_bundled_look_survives_its_share_code() {
        for (id, d) in bundled() {
            assert_eq!(decode_code(&encode_code(&d)).unwrap(), d, "{id}");
        }
    }
}
