use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use rusqlite::types::Value;
use rusqlite::{params, params_from_iter, Connection, OptionalExtension, Row};
use uuid::Uuid;

use crate::error::{CoreError, Result};
use crate::migrations;
use crate::model::*;

const DRAFT_SLOT: &str = "capture";
const SETTINGS_KEY: &str = "settings";
const DEFAULT_LIMIT: u32 = 200;
const MAX_LIMIT: u32 = 1000;
const MAX_CATEGORY_CHARS: usize = 40;
const NOTE_COLUMNS: &str =
    "id, content, status, category, source, created_at, updated_at, completed_at, archived_at";

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// The Posthaste database. One instance owns the single connection.
pub struct Db {
    conn: Connection,
    path: Option<PathBuf>,
}

impl Db {
    /// Opens (creating if needed) the database at `path` and brings its
    /// schema up to date.
    pub fn open(path: &Path) -> Result<Db> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let conn = Connection::open(path).map_err(|source| CoreError::Open {
            path: path.to_path_buf(),
            source,
        })?;
        Self::init(conn, Some(path.to_path_buf()))
    }

    pub fn open_in_memory() -> Result<Db> {
        Self::init(Connection::open_in_memory()?, None)
    }

    fn init(mut conn: Connection, path: Option<PathBuf>) -> Result<Db> {
        conn.busy_timeout(Duration::from_secs(5))?;
        // WAL keeps readers and the writer out of each other's way; FULL makes
        // every commit durable before we tell the user a note is saved.
        conn.pragma_update(None, "journal_mode", "WAL")
            .map_err(|source| match &path {
                Some(p) => CoreError::Open {
                    path: p.clone(),
                    source,
                },
                None => CoreError::Sqlite(source),
            })?;
        conn.pragma_update(None, "synchronous", "FULL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        migrations::migrate(&mut conn, path.as_deref())?;
        Ok(Db { conn, path })
    }

    pub fn path(&self) -> Option<&Path> {
        self.path.as_deref()
    }

    // ---- notes -----------------------------------------------------------

    pub fn create_note(&mut self, new: NewNote) -> Result<Note> {
        self.create_note_at(new, now_ms())
    }

    pub fn create_note_at(&mut self, new: NewNote, now: i64) -> Result<Note> {
        let tx = self.conn.transaction()?;
        let note = insert_note(&tx, new, now)?;
        tx.commit()?;
        Ok(note)
    }

    /// Saves a note from the capture window and clears the capture draft in
    /// the same transaction: either both happen or neither does.
    pub fn capture_note(&mut self, new: NewNote) -> Result<Note> {
        self.capture_note_at(new, now_ms())
    }

    pub fn capture_note_at(&mut self, new: NewNote, now: i64) -> Result<Note> {
        let tx = self.conn.transaction()?;
        let note = insert_note(&tx, new, now)?;
        tx.execute("DELETE FROM drafts WHERE id = ?1", [DRAFT_SLOT])?;
        tx.commit()?;
        Ok(note)
    }

    pub fn get_note(&self, id: &str) -> Result<Note> {
        self.conn
            .query_row(
                &format!("SELECT {NOTE_COLUMNS} FROM notes WHERE id = ?1 AND deleted_at IS NULL"),
                [id],
                note_from_row,
            )
            .optional()?
            .ok_or(CoreError::NotFound)
    }

    pub fn update_note(&mut self, id: &str, content: &str, category: Option<&str>) -> Result<Note> {
        self.update_note_at(id, content, category, now_ms())
    }

    pub fn update_note_at(
        &mut self,
        id: &str,
        content: &str,
        category: Option<&str>,
        now: i64,
    ) -> Result<Note> {
        let content = clean_content(content)?;
        let category = clean_category(category);
        let changed = self.conn.execute(
            "UPDATE notes SET content = ?1, category = ?2, updated_at = ?3
             WHERE id = ?4 AND deleted_at IS NULL",
            params![content, category, now, id],
        )?;
        if changed == 0 {
            return Err(CoreError::NotFound);
        }
        self.get_note(id)
    }

    pub fn set_status(&mut self, id: &str, status: Status) -> Result<Note> {
        self.set_status_at(id, status, now_ms())
    }

    pub fn set_status_at(&mut self, id: &str, status: Status, now: i64) -> Result<Note> {
        let sql = match status {
            Status::Inbox => {
                "UPDATE notes SET status = 'inbox', completed_at = NULL, archived_at = NULL,
                 updated_at = ?1 WHERE id = ?2 AND deleted_at IS NULL"
            }
            Status::Completed => {
                "UPDATE notes SET status = 'completed', completed_at = ?1, archived_at = NULL,
                 updated_at = ?1 WHERE id = ?2 AND deleted_at IS NULL"
            }
            Status::Archived => {
                "UPDATE notes SET status = 'archived', archived_at = ?1,
                 updated_at = ?1 WHERE id = ?2 AND deleted_at IS NULL"
            }
        };
        if self.conn.execute(sql, params![now, id])? == 0 {
            return Err(CoreError::NotFound);
        }
        self.get_note(id)
    }

    /// Moves a note to the trash. It stays recoverable with
    /// [`Db::restore_trashed`] until [`Db::purge_trashed`] removes it.
    pub fn trash_note(&mut self, id: &str) -> Result<()> {
        self.trash_note_at(id, now_ms())
    }

    pub fn trash_note_at(&mut self, id: &str, now: i64) -> Result<()> {
        let changed = self.conn.execute(
            "UPDATE notes SET deleted_at = ?1 WHERE id = ?2 AND deleted_at IS NULL",
            params![now, id],
        )?;
        if changed == 0 {
            return Err(CoreError::NotFound);
        }
        Ok(())
    }

    pub fn restore_trashed(&mut self, id: &str) -> Result<Note> {
        let changed = self.conn.execute(
            "UPDATE notes SET deleted_at = NULL WHERE id = ?1 AND deleted_at IS NOT NULL",
            [id],
        )?;
        if changed == 0 {
            return Err(CoreError::NotFound);
        }
        self.get_note(id)
    }

    /// Permanently removes notes trashed before `cutoff`. Returns how many.
    pub fn purge_trashed(&mut self, cutoff: i64) -> Result<usize> {
        Ok(self.conn.execute(
            "DELETE FROM notes WHERE deleted_at IS NOT NULL AND deleted_at < ?1",
            [cutoff],
        )?)
    }

    pub fn list_notes(&self, q: &NoteQuery) -> Result<Vec<Note>> {
        let mut sql = format!("SELECT {NOTE_COLUMNS} FROM notes WHERE deleted_at IS NULL");
        let mut args: Vec<Value> = Vec::new();

        let text = q.text.trim();
        if !text.is_empty() {
            match fts_query(text) {
                Some(m) => {
                    sql.push_str(
                        " AND seq IN (SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?)",
                    );
                    args.push(Value::Text(m));
                }
                // Nothing indexable (only punctuation): fall back to a
                // literal substring match.
                None => {
                    sql.push_str(" AND content LIKE ? ESCAPE '\\'");
                    args.push(Value::Text(format!("%{}%", like_escape(text))));
                }
            }
        }
        if !q.statuses.is_empty() {
            let marks = vec!["?"; q.statuses.len()].join(", ");
            sql.push_str(&format!(" AND status IN ({marks})"));
            args.extend(q.statuses.iter().map(|s| Value::Text(s.as_str().into())));
        }
        if let Some(from) = q.created_from {
            sql.push_str(" AND created_at >= ?");
            args.push(Value::Integer(from));
        }
        if let Some(to) = q.created_to {
            sql.push_str(" AND created_at < ?");
            args.push(Value::Integer(to));
        }
        sql.push_str(" ORDER BY created_at DESC, seq DESC LIMIT ? OFFSET ?");
        args.push(Value::Integer(
            q.limit.unwrap_or(DEFAULT_LIMIT).min(MAX_LIMIT) as i64,
        ));
        args.push(Value::Integer(q.offset.unwrap_or(0) as i64));

        let mut stmt = self.conn.prepare_cached(&sql)?;
        let rows = stmt.query_map(params_from_iter(args), note_from_row)?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    /// Sidebar counts. `today_from..today_to` is the caller's local day in UTC ms.
    pub fn counts(&self, today_from: i64, today_to: i64) -> Result<Counts> {
        Ok(self.conn.query_row(
            "SELECT
               COALESCE(SUM(status = 'inbox'), 0),
               COALESCE(SUM(created_at >= ?1 AND created_at < ?2), 0),
               COALESCE(SUM(status IN ('completed', 'archived')), 0)
             FROM notes WHERE deleted_at IS NULL",
            params![today_from, today_to],
            |r| {
                Ok(Counts {
                    inbox: r.get(0)?,
                    today: r.get(1)?,
                    archive: r.get(2)?,
                })
            },
        )?)
    }

    /// Categories in use, most used first.
    pub fn categories(&self) -> Result<Vec<String>> {
        let mut stmt = self.conn.prepare_cached(
            "SELECT category FROM notes
             WHERE deleted_at IS NULL AND category IS NOT NULL
             GROUP BY category ORDER BY COUNT(*) DESC, category LIMIT 50",
        )?;
        let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    // ---- drafts ----------------------------------------------------------

    /// Persists the in-progress capture. Empty content clears the draft.
    pub fn save_draft(&mut self, content: &str, category: Option<&str>) -> Result<()> {
        self.save_draft_at(content, category, now_ms())
    }

    pub fn save_draft_at(&mut self, content: &str, category: Option<&str>, now: i64) -> Result<()> {
        if content.trim().is_empty() {
            return self.clear_draft();
        }
        self.conn.execute(
            "INSERT INTO drafts (id, content, category, updated_at) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT (id) DO UPDATE SET
               content = excluded.content,
               category = excluded.category,
               updated_at = excluded.updated_at",
            params![DRAFT_SLOT, content, clean_category(category), now],
        )?;
        Ok(())
    }

    /// Returns the capture draft, dropping it first if it is older than the
    /// retention setting allows.
    pub fn load_draft(&mut self, retention: DraftRetention) -> Result<Option<Draft>> {
        self.load_draft_at(retention, now_ms())
    }

    pub fn load_draft_at(&mut self, retention: DraftRetention, now: i64) -> Result<Option<Draft>> {
        if let Some(max_age) = retention.max_age_ms() {
            self.conn.execute(
                "DELETE FROM drafts WHERE id = ?1 AND updated_at < ?2",
                params![DRAFT_SLOT, now - max_age],
            )?;
        }
        Ok(self
            .conn
            .query_row(
                "SELECT content, category, updated_at FROM drafts WHERE id = ?1",
                [DRAFT_SLOT],
                |r| {
                    Ok(Draft {
                        content: r.get(0)?,
                        category: r.get(1)?,
                        updated_at: r.get(2)?,
                    })
                },
            )
            .optional()?)
    }

    pub fn clear_draft(&mut self) -> Result<()> {
        self.conn
            .execute("DELETE FROM drafts WHERE id = ?1", [DRAFT_SLOT])?;
        Ok(())
    }

    // ---- settings --------------------------------------------------------

    pub fn load_settings(&self) -> Result<Settings> {
        let raw: Option<String> = self
            .conn
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                [SETTINGS_KEY],
                |r| r.get(0),
            )
            .optional()?;
        Ok(match raw {
            // A corrupt blob must not lock the user out of their notes.
            Some(json) => serde_json::from_str(&json).unwrap_or_else(|e| {
                log::warn!("stored settings unreadable, using defaults: {e}");
                Settings::default()
            }),
            None => Settings::default(),
        })
    }

    pub fn save_settings(&mut self, settings: &Settings) -> Result<()> {
        self.conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT (key) DO UPDATE SET value = excluded.value",
            params![SETTINGS_KEY, serde_json::to_string(settings)?],
        )?;
        Ok(())
    }

    // ---- data management -------------------------------------------------

    pub fn info(&self) -> Result<DataInfo> {
        let size_bytes = self
            .path
            .as_ref()
            .and_then(|p| std::fs::metadata(p).ok())
            .map(|m| m.len())
            .unwrap_or(0);
        Ok(DataInfo {
            path: self
                .path
                .as_ref()
                .map(|p| p.to_string_lossy().into_owned())
                .unwrap_or_else(|| ":memory:".into()),
            size_bytes,
            note_count: self.conn.query_row(
                "SELECT COUNT(*) FROM notes WHERE deleted_at IS NULL",
                [],
                |r| r.get(0),
            )?,
            schema_version: migrations::schema_version(&self.conn)?,
        })
    }

    /// Writes a consistent snapshot of the whole database to `dest`.
    pub fn backup_to(&self, dest: &Path) -> Result<()> {
        if dest.exists() {
            std::fs::remove_file(dest)?;
        }
        self.conn
            .execute("VACUUM INTO ?1", [dest.to_string_lossy().as_ref()])?;
        Ok(())
    }

    /// Deletes every note, draft, look and setting, then compacts the file so
    /// the removed text does not linger on disk.
    pub fn clear_all(&mut self) -> Result<()> {
        let tx = self.conn.transaction()?;
        tx.execute_batch(
            "DELETE FROM notes; DELETE FROM drafts; DELETE FROM settings; DELETE FROM looks;",
        )?;
        tx.commit()?;
        self.conn.execute_batch("VACUUM;")?;
        Ok(())
    }

    pub(crate) fn conn(&self) -> &Connection {
        &self.conn
    }

    pub(crate) fn conn_mut(&mut self) -> &mut Connection {
        &mut self.conn
    }
}

fn insert_note(conn: &Connection, new: NewNote, now: i64) -> Result<Note> {
    let note = Note {
        id: Uuid::now_v7().to_string(),
        content: clean_content(&new.content)?,
        status: Status::Inbox,
        category: clean_category(new.category.as_deref()),
        source: new
            .source
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty()),
        created_at: now,
        updated_at: now,
        completed_at: None,
        archived_at: None,
    };
    conn.execute(
        "INSERT INTO notes (id, content, status, category, source, created_at, updated_at)
         VALUES (?1, ?2, 'inbox', ?3, ?4, ?5, ?5)",
        params![note.id, note.content, note.category, note.source, now],
    )?;
    Ok(note)
}

pub(crate) fn note_from_row(r: &Row<'_>) -> rusqlite::Result<Note> {
    let status: String = r.get(2)?;
    Ok(Note {
        id: r.get(0)?,
        content: r.get(1)?,
        status: Status::parse(&status).unwrap_or(Status::Inbox),
        category: r.get(3)?,
        source: r.get(4)?,
        created_at: r.get(5)?,
        updated_at: r.get(6)?,
        completed_at: r.get(7)?,
        archived_at: r.get(8)?,
    })
}

pub(crate) fn clean_content(content: &str) -> Result<String> {
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return Err(CoreError::EmptyContent);
    }
    Ok(trimmed.replace("\r\n", "\n"))
}

pub(crate) fn clean_category(category: Option<&str>) -> Option<String> {
    let c = category?.trim().trim_start_matches('#').trim();
    if c.is_empty() {
        return None;
    }
    Some(c.chars().take(MAX_CATEGORY_CHARS).collect())
}

/// Turns free text into an FTS5 query: every word must match, each as a
/// prefix, so results narrow as the user types. Returns `None` when the text
/// has nothing the tokenizer would index.
fn fts_query(text: &str) -> Option<String> {
    let terms: Vec<String> = text
        .split(|c: char| !c.is_alphanumeric())
        .filter(|t| !t.is_empty())
        .map(|t| format!("\"{t}\"*"))
        .collect();
    if terms.is_empty() {
        None
    } else {
        Some(terms.join(" "))
    }
}

fn like_escape(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        if matches!(c, '%' | '_' | '\\') {
            out.push('\\');
        }
        out.push(c);
    }
    out
}
