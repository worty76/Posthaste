//! Look storage: the user's looks in SQLite, the bundled ones from data.
//! Follows the `transfer.rs` pattern of keeping `impl Db` beside the feature
//! and using the connection accessors from `db.rs`.

use rusqlite::{params, OptionalExtension};
use serde::Serialize;
use uuid::Uuid;

use crate::db::{now_ms, Db};
use crate::error::{CoreError, Result};
use crate::look::bundled::bundled;
use crate::look::code::decode_code;
use crate::look::derive::{resolve, ResolvedLook};
use crate::look::{Base, LookDoc, LookPreview, MAX_USER_LOOKS};

/// A look as the gallery shows it: identity plus the four preview colours.
#[derive(Serialize, Clone, PartialEq, Eq, Debug)]
pub struct LookSummary {
    pub id: String,
    pub name: String,
    pub author: Option<String>,
    pub builtin: bool,
    pub base: Base,
    pub preview: LookPreview,
}

fn summary(id: String, doc: LookDoc, builtin: bool) -> LookSummary {
    LookSummary {
        id,
        name: doc.name.clone(),
        author: doc.author.clone(),
        builtin,
        base: doc.base,
        preview: doc.preview(),
    }
}

fn is_builtin(id: &str) -> bool {
    id.starts_with("builtin:")
}

impl Db {
    /// Bundled looks in gallery order, then the user's, newest first. A
    /// stored look that no longer parses or validates is skipped with a
    /// warning, so one bad row can never blank the gallery.
    pub fn list_looks(&self) -> Result<Vec<LookSummary>> {
        let mut out: Vec<LookSummary> = bundled()
            .into_iter()
            .map(|(id, doc)| summary(id, doc, true))
            .collect();
        let mut stmt = self
            .conn()
            .prepare("SELECT id, doc FROM looks ORDER BY created_at DESC")?;
        let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
        for row in rows {
            let (id, json): (String, String) = row?;
            match serde_json::from_str::<LookDoc>(&json) {
                Ok(doc) if doc.validate().is_ok() => out.push(summary(id, doc, false)),
                Err(e) => log::warn!("stored look {id} unreadable, skipping: {e}"),
                Ok(_) => log::warn!("stored look {id} invalid, skipping"),
            }
        }
        Ok(out)
    }

    /// The look document behind an id, bundled or stored. `NotFound` when
    /// the id is unknown or the stored row is unreadable.
    pub fn look_doc(&self, id: &str) -> Result<LookDoc> {
        if is_builtin(id) {
            return bundled()
                .into_iter()
                .find(|(bid, _)| bid == id)
                .map(|(_, doc)| doc)
                .ok_or(CoreError::NotFound);
        }
        let json: Option<String> = self
            .conn()
            .query_row("SELECT doc FROM looks WHERE id = ?1", [id], |r| r.get(0))
            .optional()?;
        let json = json.ok_or(CoreError::NotFound)?;
        serde_json::from_str::<LookDoc>(&json).map_err(|_| CoreError::NotFound)
    }

    /// The look's full token map, validated and derived.
    pub fn resolve_look(&self, id: &str) -> Result<ResolvedLook> {
        let doc = self.look_doc(id)?;
        resolve(id, &doc)
    }

    /// The look the user selected, or `None` for Default and for anything
    /// unresolvable (deleted, corrupt, removed from a later version).
    pub fn active_look(&self) -> Result<Option<ResolvedLook>> {
        let Some(id) = self.load_settings()?.look_id else {
            return Ok(None);
        };
        Ok(self.resolve_look(&id).ok())
    }

    /// Saves a new user look, or updates one by id. The document is
    /// validated again here, so nothing reaches SQLite unchecked.
    pub fn save_look(&mut self, doc: LookDoc, id: Option<&str>) -> Result<LookSummary> {
        self.save_look_at(doc, id, now_ms())
    }

    pub fn save_look_at(
        &mut self,
        doc: LookDoc,
        id: Option<&str>,
        now: i64,
    ) -> Result<LookSummary> {
        doc.validate()?;
        match id {
            None => {
                let tx = self.conn_mut().transaction()?;
                // The count and the insert share one transaction, so two
                // windows saving at once cannot slip past the limit.
                let count: i64 = tx.query_row("SELECT COUNT(*) FROM looks", [], |r| r.get(0))?;
                if count as usize >= MAX_USER_LOOKS {
                    return Err(CoreError::TooManyLooks);
                }
                let new_id = format!("user:{}", Uuid::now_v7());
                tx.execute(
                    "INSERT INTO looks (id, doc, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)",
                    params![new_id, doc.to_json(), now],
                )?;
                tx.commit()?;
                Ok(summary(new_id, doc, false))
            }
            Some(id) => {
                if is_builtin(id) {
                    return Err(CoreError::BuiltinLook);
                }
                let tx = self.conn_mut().transaction()?;
                let changed = tx.execute(
                    "UPDATE looks SET doc = ?1, updated_at = ?2 WHERE id = ?3",
                    params![doc.to_json(), now, id],
                )?;
                if changed == 0 {
                    return Err(CoreError::NotFound);
                }
                tx.commit()?;
                Ok(summary(id.to_string(), doc, false))
            }
        }
    }

    /// Stores the look behind a share code as a new user look.
    pub fn import_look(&mut self, code: &str) -> Result<LookSummary> {
        let doc = decode_code(code)?;
        self.save_look(doc, None)
    }

    /// Deletes a user look. Built-in looks are data, not rows, and stay.
    pub fn delete_look(&mut self, id: &str) -> Result<()> {
        if is_builtin(id) {
            return Err(CoreError::BuiltinLook);
        }
        let tx = self.conn_mut().transaction()?;
        let changed = tx.execute("DELETE FROM looks WHERE id = ?1", [id])?;
        tx.commit()?;
        if changed == 0 {
            return Err(CoreError::NotFound);
        }
        Ok(())
    }
}
