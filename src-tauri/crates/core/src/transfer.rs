//! Portable JSON export and import.

use std::path::Path;

use rusqlite::params;
use serde::{Deserialize, Serialize};
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;
use uuid::Uuid;

use crate::db::{clean_category, clean_content, note_from_row, now_ms, Db};
use crate::error::{CoreError, Result};
use crate::model::{ImportReport, Status};

pub const EXPORT_FORMAT: &str = "posthaste-export";
pub const EXPORT_VERSION: u32 = 1;

#[derive(Debug, Serialize, Deserialize)]
struct ExportFile {
    format: String,
    version: u32,
    exported_at: String,
    notes: Vec<ExportNote>,
}

/// One note in the export file. Timestamps are RFC 3339 UTC strings so the
/// file is readable without Posthaste.
#[derive(Debug, Serialize, Deserialize)]
struct ExportNote {
    #[serde(default)]
    id: Option<String>,
    content: String,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    category: Option<String>,
    #[serde(default)]
    source: Option<String>,
    #[serde(default)]
    created_at: Option<String>,
    #[serde(default)]
    updated_at: Option<String>,
    #[serde(default)]
    completed_at: Option<String>,
    #[serde(default)]
    archived_at: Option<String>,
}

fn to_rfc3339(ms: i64) -> String {
    OffsetDateTime::from_unix_timestamp_nanos(ms as i128 * 1_000_000)
        .ok()
        .and_then(|t| t.format(&Rfc3339).ok())
        .unwrap_or_default()
}

fn from_rfc3339(s: &str) -> Option<i64> {
    OffsetDateTime::parse(s, &Rfc3339)
        .ok()
        .map(|t| (t.unix_timestamp_nanos() / 1_000_000) as i64)
}

impl Db {
    pub fn export_json(&self) -> Result<String> {
        let mut stmt = self.conn().prepare(
            "SELECT id, content, status, category, source, created_at, updated_at,
                    completed_at, archived_at
             FROM notes WHERE deleted_at IS NULL ORDER BY created_at, seq",
        )?;
        let notes = stmt
            .query_map([], note_from_row)?
            .map(|n| {
                n.map(|n| ExportNote {
                    id: Some(n.id),
                    content: n.content,
                    status: Some(n.status.as_str().to_string()),
                    category: n.category,
                    source: n.source,
                    created_at: Some(to_rfc3339(n.created_at)),
                    updated_at: Some(to_rfc3339(n.updated_at)),
                    completed_at: n.completed_at.map(to_rfc3339),
                    archived_at: n.archived_at.map(to_rfc3339),
                })
            })
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(serde_json::to_string_pretty(&ExportFile {
            format: EXPORT_FORMAT.into(),
            version: EXPORT_VERSION,
            exported_at: to_rfc3339(now_ms()),
            notes,
        })?)
    }

    /// Writes the export to `dest` via a temporary file, so a failed write
    /// never leaves a truncated export behind.
    pub fn export_to(&self, dest: &Path) -> Result<usize> {
        let json = self.export_json()?;
        let count = self.info()?.note_count as usize;
        let mut tmp = dest.as_os_str().to_owned();
        tmp.push(".part");
        let tmp = std::path::PathBuf::from(tmp);
        std::fs::write(&tmp, json)?;
        std::fs::rename(&tmp, dest)?;
        Ok(count)
    }

    pub fn import_from(&mut self, src: &Path) -> Result<ImportReport> {
        self.import_json(&std::fs::read_to_string(src)?)
    }

    /// Merges an export into the database. Notes whose id already exists are
    /// left untouched; nothing is ever overwritten. All or nothing.
    pub fn import_json(&mut self, json: &str) -> Result<ImportReport> {
        let file: ExportFile =
            serde_json::from_str(json).map_err(|e| CoreError::InvalidImport(e.to_string()))?;
        if file.format != EXPORT_FORMAT {
            return Err(CoreError::InvalidImport(format!(
                "unexpected format \"{}\"",
                file.format
            )));
        }
        if file.version > EXPORT_VERSION {
            return Err(CoreError::InvalidImport(format!(
                "export version {} is newer than this version of Posthaste supports",
                file.version
            )));
        }

        let now = now_ms();
        let mut report = ImportReport {
            imported: 0,
            skipped_existing: 0,
            skipped_invalid: 0,
        };
        let tx = self.conn_mut().transaction()?;
        {
            let mut insert = tx.prepare(
                "INSERT OR IGNORE INTO notes
                   (id, content, status, category, source, created_at, updated_at,
                    completed_at, archived_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            )?;
            for n in file.notes {
                let content = match clean_content(&n.content) {
                    Ok(c) => c,
                    Err(_) => {
                        report.skipped_invalid += 1;
                        continue;
                    }
                };
                let status = match n.status.as_deref() {
                    None => Status::Inbox,
                    Some(s) => match Status::parse(s) {
                        Some(s) => s,
                        None => {
                            report.skipped_invalid += 1;
                            continue;
                        }
                    },
                };
                let ts = |v: &Option<String>| v.as_deref().and_then(from_rfc3339);
                let created = ts(&n.created_at).unwrap_or(now);
                let completed =
                    ts(&n.completed_at).or((status == Status::Completed).then_some(created));
                let archived =
                    ts(&n.archived_at).or((status == Status::Archived).then_some(created));
                let id =
                    n.id.filter(|id| !id.trim().is_empty())
                        .unwrap_or_else(|| Uuid::now_v7().to_string());
                let inserted = insert.execute(params![
                    id,
                    content,
                    status.as_str(),
                    clean_category(n.category.as_deref()),
                    n.source,
                    created,
                    ts(&n.updated_at).unwrap_or(created),
                    completed,
                    archived,
                ])?;
                if inserted == 1 {
                    report.imported += 1;
                } else {
                    report.skipped_existing += 1;
                }
            }
        }
        tx.commit()?;
        Ok(report)
    }
}
