//! Tests for the look module: colour maths, validation, derivation, share
//! codes, bundled looks and storage.

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
