-- Timestamps are UTC, stored as milliseconds since the Unix epoch.
-- `seq` is an explicit INTEGER PRIMARY KEY so row ids stay stable across
-- VACUUM (the full-text index in 0002 refers to rows by it).
CREATE TABLE notes (
    seq          INTEGER PRIMARY KEY AUTOINCREMENT,
    id           TEXT    NOT NULL UNIQUE,
    content      TEXT    NOT NULL CHECK (length(trim(content)) > 0),
    status       TEXT    NOT NULL DEFAULT 'inbox'
                         CHECK (status IN ('inbox', 'completed', 'archived')),
    category     TEXT,
    source       TEXT,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL,
    completed_at INTEGER,
    archived_at  INTEGER,
    deleted_at   INTEGER
);

CREATE INDEX notes_live_by_status ON notes (status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX notes_live_by_created ON notes (created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX notes_trashed ON notes (deleted_at) WHERE deleted_at IS NOT NULL;

CREATE TABLE drafts (
    id         TEXT    PRIMARY KEY NOT NULL,
    content    TEXT    NOT NULL,
    category   TEXT,
    updated_at INTEGER NOT NULL
) WITHOUT ROWID;

CREATE TABLE settings (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
) WITHOUT ROWID;
