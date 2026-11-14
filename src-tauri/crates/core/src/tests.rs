use rusqlite::Connection;

use crate::migrations::{self, Migration, MIGRATIONS};
use crate::*;

fn db() -> Db {
    Db::open_in_memory().unwrap()
}

fn note(content: &str) -> NewNote {
    NewNote {
        content: content.into(),
        ..Default::default()
    }
}

fn contents(notes: &[Note]) -> Vec<&str> {
    notes.iter().map(|n| n.content.as_str()).collect()
}

fn search(db: &Db, text: &str) -> Vec<Note> {
    db.list_notes(&NoteQuery {
        text: text.into(),
        ..Default::default()
    })
    .unwrap()
}

// ---- creation ------------------------------------------------------------

#[test]
fn creates_a_note_in_the_inbox() {
    let mut db = db();
    let n = db
        .create_note_at(
            NewNote {
                content: "  Investigate PostgreSQL indexing strategy.  ".into(),
                category: Some(" #work ".into()),
                source: Some("Code".into()),
            },
            1_000,
        )
        .unwrap();
    assert_eq!(n.content, "Investigate PostgreSQL indexing strategy.");
    assert_eq!(n.status, Status::Inbox);
    assert_eq!(n.category.as_deref(), Some("work"));
    assert_eq!(n.source.as_deref(), Some("Code"));
    assert_eq!((n.created_at, n.updated_at), (1_000, 1_000));
    assert_eq!(db.get_note(&n.id).unwrap(), n);
}

#[test]
fn rejects_empty_and_whitespace_only_notes() {
    let mut db = db();
    for blank in ["", "   ", "\n\t \n"] {
        assert!(matches!(
            db.create_note(note(blank)),
            Err(CoreError::EmptyContent)
        ));
    }
    assert_eq!(db.list_notes(&NoteQuery::default()).unwrap().len(), 0);
}

#[test]
fn keeps_multiline_content_and_normalises_line_endings() {
    let mut db = db();
    let n = db.create_note(note("first\r\nsecond\n\nfourth")).unwrap();
    assert_eq!(n.content, "first\nsecond\n\nfourth");
}

#[test]
fn blank_category_is_stored_as_none() {
    let mut db = db();
    let n = db
        .create_note(NewNote {
            content: "x".into(),
            category: Some("  ".into()),
            source: None,
        })
        .unwrap();
    assert_eq!(n.category, None);
}

// ---- editing -------------------------------------------------------------

#[test]
fn edits_content_and_category() {
    let mut db = db();
    let n = db.create_note_at(note("draft wording"), 1_000).unwrap();
    let edited = db
        .update_note_at(&n.id, "final wording", Some("ideas"), 2_000)
        .unwrap();
    assert_eq!(edited.content, "final wording");
    assert_eq!(edited.category.as_deref(), Some("ideas"));
    assert_eq!(edited.created_at, 1_000);
    assert_eq!(edited.updated_at, 2_000);
}

#[test]
fn editing_to_empty_is_rejected_and_keeps_the_note() {
    let mut db = db();
    let n = db.create_note(note("keep me")).unwrap();
    assert!(matches!(
        db.update_note(&n.id, "   ", None),
        Err(CoreError::EmptyContent)
    ));
    assert_eq!(db.get_note(&n.id).unwrap().content, "keep me");
}

#[test]
fn editing_a_missing_note_reports_not_found() {
    let mut db = db();
    assert!(matches!(
        db.update_note("nope", "x", None),
        Err(CoreError::NotFound)
    ));
}

// ---- completion and archiving ---------------------------------------------

#[test]
fn completing_sets_and_reopening_clears_the_timestamp() {
    let mut db = db();
    let n = db.create_note_at(note("task"), 1_000).unwrap();

    let done = db.set_status_at(&n.id, Status::Completed, 2_000).unwrap();
    assert_eq!(done.status, Status::Completed);
    assert_eq!(done.completed_at, Some(2_000));

    let reopened = db.set_status_at(&n.id, Status::Inbox, 3_000).unwrap();
    assert_eq!(reopened.status, Status::Inbox);
    assert_eq!(reopened.completed_at, None);
    assert_eq!(reopened.archived_at, None);
}

#[test]
fn archiving_and_restoring() {
    let mut db = db();
    let n = db.create_note_at(note("reference"), 1_000).unwrap();

    let archived = db.set_status_at(&n.id, Status::Archived, 2_000).unwrap();
    assert_eq!(archived.status, Status::Archived);
    assert_eq!(archived.archived_at, Some(2_000));

    let inbox = NoteQuery {
        statuses: vec![Status::Inbox],
        ..Default::default()
    };
    assert!(db.list_notes(&inbox).unwrap().is_empty());

    db.set_status_at(&n.id, Status::Inbox, 3_000).unwrap();
    assert_eq!(db.list_notes(&inbox).unwrap().len(), 1);
}

// ---- deletion --------------------------------------------------------------

#[test]
fn trashed_notes_disappear_but_can_be_restored() {
    let mut db = db();
    let n = db.create_note(note("oops")).unwrap();
    db.trash_note_at(&n.id, 5_000).unwrap();

    assert!(matches!(db.get_note(&n.id), Err(CoreError::NotFound)));
    assert!(db.list_notes(&NoteQuery::default()).unwrap().is_empty());
    assert!(search(&db, "oops").is_empty());

    let back = db.restore_trashed(&n.id).unwrap();
    assert_eq!(back, n);
    assert_eq!(search(&db, "oops").len(), 1);
}

#[test]
fn purge_removes_only_notes_trashed_before_the_cutoff() {
    let mut db = db();
    let old = db.create_note(note("old")).unwrap();
    let recent = db.create_note(note("recent")).unwrap();
    let live = db.create_note(note("live")).unwrap();
    db.trash_note_at(&old.id, 1_000).unwrap();
    db.trash_note_at(&recent.id, 9_000).unwrap();

    assert_eq!(db.purge_trashed(5_000).unwrap(), 1);
    assert!(matches!(
        db.restore_trashed(&old.id),
        Err(CoreError::NotFound)
    ));
    assert!(db.restore_trashed(&recent.id).is_ok());
    assert!(db.get_note(&live.id).is_ok());
    // The purged note is gone from the search index too.
    assert!(search(&db, "old").is_empty());
}

// ---- listing ---------------------------------------------------------------

#[test]
fn lists_newest_first_with_stable_order_for_equal_timestamps() {
    let mut db = db();
    db.create_note_at(note("one"), 1_000).unwrap();
    db.create_note_at(note("two"), 2_000).unwrap();
    db.create_note_at(note("three-a"), 3_000).unwrap();
    db.create_note_at(note("three-b"), 3_000).unwrap();
    let all = db.list_notes(&NoteQuery::default()).unwrap();
    assert_eq!(contents(&all), ["three-b", "three-a", "two", "one"]);
}

#[test]
fn filters_by_status_and_date_range_and_paginates() {
    let mut db = db();
    let a = db.create_note_at(note("a"), 1_000).unwrap();
    db.create_note_at(note("b"), 2_000).unwrap();
    db.create_note_at(note("c"), 3_000).unwrap();
    db.set_status(&a.id, Status::Completed).unwrap();

    let completed = db
        .list_notes(&NoteQuery {
            statuses: vec![Status::Completed, Status::Archived],
            ..Default::default()
        })
        .unwrap();
    assert_eq!(contents(&completed), ["a"]);

    // from is inclusive, to is exclusive
    let range = db
        .list_notes(&NoteQuery {
            created_from: Some(2_000),
            created_to: Some(3_000),
            ..Default::default()
        })
        .unwrap();
    assert_eq!(contents(&range), ["b"]);

    let page = db
        .list_notes(&NoteQuery {
            limit: Some(1),
            offset: Some(1),
            ..Default::default()
        })
        .unwrap();
    assert_eq!(contents(&page), ["b"]);
}

#[test]
fn counts_follow_status_and_the_callers_day() {
    let mut db = db();
    let a = db.create_note_at(note("yesterday"), 500).unwrap();
    let b = db.create_note_at(note("today 1"), 1_500).unwrap();
    db.create_note_at(note("today 2"), 1_600).unwrap();
    let d = db.create_note_at(note("deleted"), 1_700).unwrap();
    db.set_status(&a.id, Status::Archived).unwrap();
    db.set_status(&b.id, Status::Completed).unwrap();
    db.trash_note(&d.id).unwrap();

    assert_eq!(
        db.counts(1_000, 2_000).unwrap(),
        Counts {
            inbox: 1,
            today: 2,
            archive: 2
        }
    );
    assert_eq!(
        Db::open_in_memory().unwrap().counts(0, 1).unwrap(),
        Counts {
            inbox: 0,
            today: 0,
            archive: 0
        }
    );
}

#[test]
fn categories_are_listed_most_used_first() {
    let mut db = db();
    for (content, cat) in [("a", "work"), ("b", "ideas"), ("c", "work")] {
        db.create_note(NewNote {
            content: content.into(),
            category: Some(cat.into()),
            source: None,
        })
        .unwrap();
    }
    db.create_note(note("uncategorised")).unwrap();
    assert_eq!(db.categories().unwrap(), ["work", "ideas"]);
}

// ---- search ----------------------------------------------------------------

#[test]
fn search_matches_words_prefixes_and_all_terms() {
    let mut db = db();
    db.create_note_at(note("Investigate PostgreSQL indexing strategy"), 1_000)
        .unwrap();
    db.create_note_at(note("Read about index-only scans"), 2_000)
        .unwrap();
    db.create_note_at(note("Buy milk"), 3_000).unwrap();

    assert_eq!(search(&db, "postgresql").len(), 1);
    // prefix, case-insensitive, newest first
    assert_eq!(
        contents(&search(&db, "IND")),
        [
            "Read about index-only scans",
            "Investigate PostgreSQL indexing strategy"
        ]
    );
    // every term must match
    assert_eq!(search(&db, "index strat").len(), 1);
    assert!(search(&db, "index milk").is_empty());
    assert!(search(&db, "nothing-like-this").is_empty());
}

#[test]
fn search_ignores_diacritics_and_covers_category() {
    let mut db = db();
    db.create_note(NewNote {
        content: "Đọc tài liệu về chỉ mục".into(),
        category: Some("học tập".into()),
        source: None,
    })
    .unwrap();
    assert_eq!(search(&db, "tai lieu").len(), 1);
    assert_eq!(search(&db, "hoc").len(), 1);
}

#[test]
fn search_tolerates_fts_syntax_and_punctuation() {
    let mut db = db();
    db.create_note(note("use \"quotes\" AND (parens) -- c++ 100%"))
        .unwrap();
    // None of these may error, whatever the user types.
    for q in [
        "\"", "AND", "(", "c++", "NEAR(", "*", "a:b", "100%", "--", "^x",
    ] {
        let _ = search(&db, q);
    }
    assert_eq!(search(&db, "\"quotes\"").len(), 1);
    assert_eq!(search(&db, "100%").len(), 1);
    assert_eq!(search(&db, "--").len(), 1);
    assert!(search(&db, "%%").is_empty());
}

#[test]
fn search_follows_edits_and_includes_archived_notes() {
    let mut db = db();
    let n = db.create_note(note("alpha")).unwrap();
    db.update_note(&n.id, "beta", None).unwrap();
    assert!(search(&db, "alpha").is_empty());
    assert_eq!(search(&db, "beta").len(), 1);

    db.set_status(&n.id, Status::Archived).unwrap();
    assert_eq!(search(&db, "beta").len(), 1);
    let open_only = db
        .list_notes(&NoteQuery {
            text: "beta".into(),
            statuses: vec![Status::Inbox],
            ..Default::default()
        })
        .unwrap();
    assert!(open_only.is_empty());
}

#[test]
fn search_stays_fast_with_a_large_collection() {
    let mut db = db();
    for i in 0..20_000 {
        db.create_note_at(note(&format!("note number {i} about topic{}", i % 97)), i)
            .unwrap();
    }
    db.create_note_at(note("the needle in the haystack"), 99_999)
        .unwrap();
    let started = std::time::Instant::now();
    let hits = search(&db, "needle hay");
    let elapsed = started.elapsed();
    assert_eq!(hits.len(), 1);
    assert!(
        elapsed.as_millis() < 100,
        "search took {elapsed:?} over 20k notes"
    );
}

// ---- drafts ----------------------------------------------------------------

#[test]
fn draft_round_trips_and_overwrites() {
    let mut db = db();
    assert_eq!(db.load_draft(DraftRetention::Forever).unwrap(), None);
    db.save_draft_at("half a thou", None, 1_000).unwrap();
    db.save_draft_at("half a thought", Some("ideas"), 2_000)
        .unwrap();
    assert_eq!(
        db.load_draft(DraftRetention::Forever).unwrap(),
        Some(Draft {
            content: "half a thought".into(),
            category: Some("ideas".into()),
            updated_at: 2_000,
        })
    );
}

#[test]
fn saving_an_empty_draft_clears_it() {
    let mut db = db();
    db.save_draft("something", None).unwrap();
    db.save_draft("   ", None).unwrap();
    assert_eq!(db.load_draft(DraftRetention::Forever).unwrap(), None);
}

#[test]
fn draft_expires_according_to_retention() {
    const HOUR: i64 = 60 * 60 * 1000;
    let mut db = db();
    db.save_draft_at("stale", None, 0).unwrap();
    assert!(db
        .load_draft_at(DraftRetention::Day, 23 * HOUR)
        .unwrap()
        .is_some());
    assert!(db
        .load_draft_at(DraftRetention::Forever, 1_000 * HOUR)
        .unwrap()
        .is_some());
    assert!(db
        .load_draft_at(DraftRetention::Day, 25 * HOUR)
        .unwrap()
        .is_none());
}

#[test]
fn capturing_saves_the_note_and_clears_the_draft_together() {
    let mut db = db();
    db.save_draft("Investigate indexing", None).unwrap();
    let n = db.capture_note(note("Investigate indexing")).unwrap();
    assert_eq!(db.get_note(&n.id).unwrap().content, "Investigate indexing");
    assert_eq!(db.load_draft(DraftRetention::Forever).unwrap(), None);
}

#[test]
fn a_failed_capture_keeps_the_draft() {
    let mut db = db();
    db.save_draft("   draft survives   ", None).unwrap();
    assert!(db.capture_note(note("   ")).is_err());
    assert!(db.load_draft(DraftRetention::Forever).unwrap().is_some());
}

#[test]
fn draft_and_notes_survive_an_unclean_shutdown() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("posthaste.db");
    {
        let mut db = Db::open(&path).unwrap();
        db.create_note(note("saved before the crash")).unwrap();
        db.save_draft("typed but not saved", None).unwrap();
        // Simulate a crash: the connection is never closed cleanly.
        std::mem::forget(db);
    }
    let mut db = Db::open(&path).unwrap();
    assert_eq!(search(&db, "crash").len(), 1);
    assert_eq!(
        db.load_draft(DraftRetention::Forever)
            .unwrap()
            .unwrap()
            .content,
        "typed but not saved"
    );
}

// ---- settings --------------------------------------------------------------

#[test]
fn settings_default_then_round_trip() {
    let mut db = db();
    assert_eq!(db.load_settings().unwrap(), Settings::default());
    let s = Settings {
        theme: Theme::Dark,
        capture_shortcut: "Alt+Space".into(),
        hide_after_save: false,
        ..Default::default()
    };
    db.save_settings(&s).unwrap();
    assert_eq!(db.load_settings().unwrap(), s);
}

#[test]
fn settings_tolerate_missing_unknown_and_corrupt_values() {
    let db = db();
    let set = |json: &str| {
        db.conn()
            .execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES ('settings', ?1)",
                [json],
            )
            .unwrap();
    };
    set(r#"{"theme":"dark","some_future_field":true}"#);
    let s = db.load_settings().unwrap();
    assert_eq!(s.theme, Theme::Dark);
    assert_eq!(s.capture_shortcut, DEFAULT_CAPTURE_SHORTCUT);

    set("not json at all");
    assert_eq!(db.load_settings().unwrap(), Settings::default());
}

// ---- export, import, backup --------------------------------------------------

#[test]
fn export_then_import_into_a_fresh_database_preserves_everything() {
    let mut a = db();
    let n1 = a
        .create_note_at(
            NewNote {
                content: "first\nwith two lines".into(),
                category: Some("work".into()),
                source: Some("Terminal".into()),
            },
            1_700_000_000_000,
        )
        .unwrap();
    let n2 = a.create_note_at(note("second"), 1_700_000_001_000).unwrap();
    let n2 = a
        .set_status_at(&n2.id, Status::Completed, 1_700_000_002_000)
        .unwrap();
    let trashed = a.create_note(note("trashed")).unwrap();
    a.trash_note(&trashed.id).unwrap();

    let json = a.export_json().unwrap();
    assert!(json.contains("2023-11-14T22:13:20Z"), "readable timestamps");
    assert!(!json.contains("trashed"));

    let mut b = db();
    let report = b.import_json(&json).unwrap();
    assert_eq!(
        report,
        ImportReport {
            imported: 2,
            skipped_existing: 0,
            skipped_invalid: 0
        }
    );
    assert_eq!(b.get_note(&n1.id).unwrap(), n1);
    assert_eq!(b.get_note(&n2.id).unwrap(), n2);
    assert_eq!(
        search(&b, "two lines").len(),
        1,
        "imported notes are indexed"
    );
}

#[test]
fn importing_twice_never_duplicates_or_overwrites() {
    let mut a = db();
    let n = a.create_note(note("original")).unwrap();
    let json = a.export_json().unwrap();
    a.update_note(&n.id, "edited after export", None).unwrap();

    let report = a.import_json(&json).unwrap();
    assert_eq!((report.imported, report.skipped_existing), (0, 1));
    assert_eq!(a.get_note(&n.id).unwrap().content, "edited after export");
}

#[test]
fn import_rejects_foreign_files_without_touching_data() {
    let mut db = db();
    db.create_note(note("mine")).unwrap();
    for bad in [
        "",
        "[]",
        r#"{"format":"something-else","version":1,"exported_at":"","notes":[]}"#,
        r#"{"format":"posthaste-export","version":99,"exported_at":"","notes":[]}"#,
    ] {
        assert!(matches!(
            db.import_json(bad),
            Err(CoreError::InvalidImport(_))
        ));
    }
    assert_eq!(db.info().unwrap().note_count, 1);
}

#[test]
fn import_skips_invalid_entries_and_fills_in_missing_fields() {
    let mut db = db();
    let json = r#"{
      "format": "posthaste-export", "version": 1, "exported_at": "",
      "notes": [
        {"content": "minimal"},
        {"content": "   "},
        {"content": "bad status", "status": "pinned"},
        {"content": "done", "status": "completed", "created_at": "2024-01-01T00:00:00Z"}
      ]
    }"#;
    let report = db.import_json(json).unwrap();
    assert_eq!((report.imported, report.skipped_invalid), (2, 2));
    let done = &search(&db, "done")[0];
    assert_eq!(done.status, Status::Completed);
    assert_eq!(done.completed_at, Some(done.created_at));
}

#[test]
fn export_file_and_backup_can_be_reopened() {
    let dir = tempfile::tempdir().unwrap();
    let mut db = Db::open(&dir.path().join("posthaste.db")).unwrap();
    db.create_note(note("backed up")).unwrap();

    let export = dir.path().join("export.json");
    assert_eq!(db.export_to(&export).unwrap(), 1);
    assert!(std::fs::read_to_string(&export)
        .unwrap()
        .contains("backed up"));
    assert!(!dir.path().join("export.json.part").exists());

    let backup = dir.path().join("backup.db");
    db.backup_to(&backup).unwrap();
    db.backup_to(&backup).unwrap(); // overwriting an existing backup works
    let copy = Db::open(&backup).unwrap();
    assert_eq!(search(&copy, "backed").len(), 1);
}

#[test]
fn clear_all_removes_notes_drafts_and_settings() {
    let mut db = db();
    db.create_note(note("secret")).unwrap();
    db.save_draft("draft", None).unwrap();
    db.save_settings(&Settings {
        theme: Theme::Light,
        ..Default::default()
    })
    .unwrap();
    db.clear_all().unwrap();
    assert_eq!(db.info().unwrap().note_count, 0);
    assert!(search(&db, "secret").is_empty());
    assert_eq!(db.load_draft(DraftRetention::Forever).unwrap(), None);
    assert_eq!(db.load_settings().unwrap(), Settings::default());
}

// ---- migrations --------------------------------------------------------------

#[test]
fn a_fresh_database_is_at_the_latest_schema() {
    let db = db();
    assert_eq!(
        db.info().unwrap().schema_version,
        MIGRATIONS.last().unwrap().version
    );
}

#[test]
fn migration_versions_are_strictly_increasing_from_one() {
    for (i, m) in MIGRATIONS.iter().enumerate() {
        assert_eq!(m.version, i as i64 + 1);
    }
}

#[test]
fn reopening_is_idempotent() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("posthaste.db");
    let id = {
        let mut db = Db::open(&path).unwrap();
        db.create_note(note("persisted")).unwrap().id
    };
    for _ in 0..3 {
        let db = Db::open(&path).unwrap();
        assert_eq!(db.get_note(&id).unwrap().content, "persisted");
    }
    // No upgrade happened, so no snapshot was written.
    assert!(std::fs::read_dir(dir.path()).unwrap().count() <= 3);
}

#[test]
fn upgrading_from_v1_keeps_notes_indexes_them_and_leaves_a_snapshot() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("posthaste.db");
    {
        // A database as version 1 of the app would have left it.
        let mut conn = Connection::open(&path).unwrap();
        migrations::migrate_with(&mut conn, Some(&path), &MIGRATIONS[..1]).unwrap();
        conn.execute(
            "INSERT INTO notes (id, content, created_at, updated_at)
             VALUES ('legacy-1', 'written before search existed', 1, 1)",
            [],
        )
        .unwrap();
    }

    let db = Db::open(&path).unwrap();
    assert_eq!(
        db.info().unwrap().schema_version,
        MIGRATIONS.last().unwrap().version
    );
    assert_eq!(
        db.get_note("legacy-1").unwrap().content,
        "written before search existed"
    );
    assert_eq!(search(&db, "before search").len(), 1);

    let snapshot = migrations::pre_migration_backup_path(&path, 1);
    assert!(snapshot.exists());
    let old = Connection::open(&snapshot).unwrap();
    assert_eq!(migrations::schema_version(&old).unwrap(), 1);
    let n: i64 = old
        .query_row("SELECT COUNT(*) FROM notes", [], |r| r.get(0))
        .unwrap();
    assert_eq!(n, 1);
}

#[test]
fn upgrading_from_v2_keeps_notes_and_adds_the_looks_table() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("posthaste.db");
    {
        // A database as version 2 of the app would have left it.
        let mut conn = Connection::open(&path).unwrap();
        migrations::migrate_with(&mut conn, Some(&path), &MIGRATIONS[..2]).unwrap();
        conn.execute(
            "INSERT INTO notes (id, content, created_at, updated_at)
             VALUES ('legacy-2', 'written before looks existed', 1, 1)",
            [],
        )
        .unwrap();
    }

    let db = Db::open(&path).unwrap();
    assert_eq!(
        db.info().unwrap().schema_version,
        MIGRATIONS.last().unwrap().version
    );
    assert_eq!(
        db.get_note("legacy-2").unwrap().content,
        "written before looks existed"
    );
    let tables: i64 = db
        .conn()
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'looks'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(tables, 1);
}

#[test]
fn a_failing_migration_rolls_back_completely() {
    let mut conn = Connection::open_in_memory().unwrap();
    migrations::migrate_with(&mut conn, None, &MIGRATIONS[..1]).unwrap();
    conn.execute(
        "INSERT INTO notes (id, content, created_at, updated_at) VALUES ('a', 'safe', 1, 1)",
        [],
    )
    .unwrap();

    let broken = [
        Migration {
            version: 1,
            sql: MIGRATIONS[0].sql,
        },
        Migration {
            version: 2,
            sql: "ALTER TABLE notes ADD COLUMN extra TEXT; DELETE FROM notes; SELECT * FROM no_such_table;",
        },
    ];
    let err = migrations::migrate_with(&mut conn, None, &broken).unwrap_err();
    assert!(matches!(err, CoreError::Migration { version: 2, .. }));

    assert_eq!(migrations::schema_version(&conn).unwrap(), 1);
    let content: String = conn
        .query_row("SELECT content FROM notes WHERE id = 'a'", [], |r| r.get(0))
        .unwrap();
    assert_eq!(content, "safe");
    assert!(conn.prepare("SELECT extra FROM notes").is_err());
}

#[test]
fn a_database_from_a_newer_version_is_refused_untouched() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("posthaste.db");
    drop(Db::open(&path).unwrap());
    Connection::open(&path)
        .unwrap()
        .pragma_update(None, "user_version", 999)
        .unwrap();

    assert!(matches!(
        Db::open(&path),
        Err(CoreError::NewerSchema {
            found: 999,
            supported: 3
        })
    ));
    let conn = Connection::open(&path).unwrap();
    assert_eq!(migrations::schema_version(&conn).unwrap(), 999);
}

#[test]
fn a_file_that_is_not_a_database_is_reported_not_overwritten() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("posthaste.db");
    std::fs::write(&path, "this is definitely not sqlite").unwrap();
    assert!(Db::open(&path).is_err());
    assert_eq!(
        std::fs::read_to_string(&path).unwrap(),
        "this is definitely not sqlite"
    );
}

#[test]
fn the_database_rejects_rows_that_bypass_validation() {
    let db = db();
    let insert = |content: &str, status: &str| {
        db.conn().execute(
            "INSERT INTO notes (id, content, status, created_at, updated_at)
             VALUES (hex(randomblob(8)), ?1, ?2, 1, 1)",
            [content, status],
        )
    };
    assert!(insert("   ", "inbox").is_err());
    assert!(insert("fine", "pinned").is_err());
    assert!(insert("fine", "inbox").is_ok());
}
