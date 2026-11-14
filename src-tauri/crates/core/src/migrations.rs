//! Versioned, transactional schema migrations.
//!
//! The schema version lives in `PRAGMA user_version`. Each migration runs in
//! its own transaction together with the version bump, so a failure leaves the
//! database exactly as it was. Before upgrading a database that already holds
//! data, a snapshot is written next to it.

use std::path::{Path, PathBuf};

use rusqlite::Connection;

use crate::error::{CoreError, Result};

pub struct Migration {
    pub version: i64,
    pub sql: &'static str,
}

pub const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        sql: include_str!("../migrations/0001_init.sql"),
    },
    Migration {
        version: 2,
        sql: include_str!("../migrations/0002_search.sql"),
    },
];

pub fn schema_version(conn: &Connection) -> Result<i64> {
    Ok(conn.query_row("PRAGMA user_version", [], |r| r.get(0))?)
}

/// Path of the snapshot taken before upgrading from `from_version`.
pub fn pre_migration_backup_path(db_path: &Path, from_version: i64) -> PathBuf {
    let mut name = db_path
        .file_name()
        .map(|n| n.to_os_string())
        .unwrap_or_default();
    name.push(format!(".before-upgrade-from-v{from_version}.bak"));
    db_path.with_file_name(name)
}

pub fn migrate(conn: &mut Connection, db_path: Option<&Path>) -> Result<()> {
    migrate_with(conn, db_path, MIGRATIONS)
}

pub(crate) fn migrate_with(
    conn: &mut Connection,
    db_path: Option<&Path>,
    migrations: &[Migration],
) -> Result<()> {
    let current = schema_version(conn)?;
    let latest = migrations.last().map(|m| m.version).unwrap_or(0);

    if current > latest {
        return Err(CoreError::NewerSchema {
            found: current,
            supported: latest,
        });
    }
    if current == latest {
        return Ok(());
    }

    if current > 0 {
        if let Some(path) = db_path {
            let backup = pre_migration_backup_path(path, current);
            if backup.exists() {
                std::fs::remove_file(&backup)?;
            }
            conn.execute("VACUUM INTO ?1", [backup.to_string_lossy().as_ref()])?;
            log::info!("schema upgrade v{current} -> v{latest}: snapshot written");
        }
    }

    for m in migrations.iter().filter(|m| m.version > current) {
        let run = |conn: &mut Connection| -> rusqlite::Result<()> {
            let tx = conn.transaction()?;
            tx.execute_batch(m.sql)?;
            tx.pragma_update(None, "user_version", m.version)?;
            tx.commit()
        };
        run(conn).map_err(|source| CoreError::Migration {
            version: m.version,
            source,
        })?;
        log::info!("applied schema migration v{}", m.version);
    }
    Ok(())
}
