# crates/core: storage

SQLite schema, migrations, notes, drafts, search, settings, export/import.
Everything that decides what valid data is lives here. This crate has no Tauri,
window or UI dependency, and must stay that way: it is tested against a plain
database file in milliseconds.

## Files

| File | Owns |
|---|---|
| `db.rs` | `Db`: the connection and every query |
| `model.rs` | Types shared with the frontend (serde) |
| `migrations.rs` + `migrations/*.sql` | Schema history |
| `transfer.rs` | JSON export and import |
| `look/` | Looks: document validation, token derivation, share codes, storage. Tests in `look/tests.rs` |
| `error.rs` | `CoreError` and its stable `code()` |
| `tests.rs` | Tests for db, model and migrations |

Look-specific rules: look validation and derivation live only in `look/`
(`mod.rs` validates, `derive.rs` derives the token map); the bundled looks are
data files in `crates/core/looks/`, parsed by `look/bundled.rs` and kept valid
by tests. A user look is stored as its re-serialized JSON in the `looks`
table; unreadable rows are skipped, never trusted.

## Data safety

- Every write that touches more than one row or table is one transaction.
  Capture is the model: insert the note and delete the draft together.
- Inputs are cleaned at the boundary (`clean_content`, `clean_category`) and
  also constrained in the schema with `CHECK`. Keep both; the schema is the
  last line of defence against a bug in the Rust code.
- Deleting a note is a soft delete (`deleted_at`). Every read filters
  `deleted_at IS NULL`. A new query that forgets this resurrects deleted notes.
- Import never overwrites. Export excludes trashed notes.
- `synchronous = FULL` and WAL stay. Do not trade durability for speed.

## Migrations

- **Append-only.** Never edit or reorder a file in `migrations/`. Add
  `000N_description.sql` and a matching entry at the end of `MIGRATIONS`.
- Versions are consecutive integers from 1; a test enforces it.
- Each migration must work on a database that already holds data, and is run
  inside a transaction with the version bump.
- Every migration gets a test that starts from the previous schema with rows in
  it, upgrades, and asserts the rows survived (see
  `upgrading_from_v1_keeps_notes_indexes_them_and_leaves_a_snapshot`).
- If a migration changes a column that the full-text index covers, update the
  triggers in the same migration.

## Queries

- All SQL uses bound parameters. Never format user input into SQL. The dynamic
  parts of `list_notes` build placeholders, not values.
- Search text goes through `fts_query`, which tokenises it. Raw user text never
  reaches `MATCH`.
- A new filter or sort gets an index if it would otherwise scan, and the
  large-collection test (`search_stays_fast_with_a_large_collection`) is the
  model for proving it.
- Timestamps are UTC milliseconds (`i64`). The caller supplies local-day
  bounds; this crate never guesses a time zone.

## API shape

- Public methods come in pairs where time matters: `create_note(new)` calls
  `create_note_at(new, now_ms())`. Tests use the `_at` form. Never call the
  system clock inside logic that a test needs to control.
- Return `Result<T>` with a `CoreError`. A new failure kind gets a variant, a
  stable `code()`, and a message a person can act on.
- A type sent to the frontend derives `Serialize`/`Deserialize` and is mirrored
  in `src/lib/types.ts` in the same change.
- `Settings` uses `#[serde(default)]`: a new field must have a default so
  settings saved by older versions still load. Never rename or repurpose an
  existing field; add a new one.

## Tests

- Every public method has tests for the normal case, the empty or missing
  case, and the failure case.
- Tests use `Db::open_in_memory()` unless the behaviour is about files
  (reopen, crash, backup, migration snapshot); those use `tempfile`.
- Test names are sentences about behaviour.
