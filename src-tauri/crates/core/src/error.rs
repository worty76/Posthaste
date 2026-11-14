use std::path::PathBuf;

pub type Result<T> = std::result::Result<T, CoreError>;

#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("A note can't be empty.")]
    EmptyContent,

    #[error("That note no longer exists.")]
    NotFound,

    #[error("The disk is full, so the change could not be saved. Free some space and try again.")]
    DiskFull,

    #[error("The database at {path} could not be opened: {source}")]
    Open {
        path: PathBuf,
        #[source]
        source: rusqlite::Error,
    },

    #[error(
        "This database was created by a newer version of Posthaste (schema {found}, this version \
         understands up to {supported}). Update Posthaste to open it; nothing was changed."
    )]
    NewerSchema { found: i64, supported: i64 },

    #[error("Upgrading the database to schema {version} failed and was rolled back: {source}")]
    Migration {
        version: i64,
        #[source]
        source: rusqlite::Error,
    },

    #[error("That file isn't a Posthaste export: {0}")]
    InvalidImport(String),

    #[error("{0}")]
    InvalidLook(String),

    #[error("Database error: {0}")]
    Sqlite(#[source] rusqlite::Error),

    #[error("File error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Could not read or write JSON: {0}")]
    Json(#[from] serde_json::Error),
}

impl CoreError {
    /// Stable machine-readable code for the frontend.
    pub fn code(&self) -> &'static str {
        match self {
            CoreError::EmptyContent => "empty_content",
            CoreError::NotFound => "not_found",
            CoreError::DiskFull => "disk_full",
            CoreError::Open { .. } => "db_open",
            CoreError::NewerSchema { .. } => "db_newer_schema",
            CoreError::Migration { .. } => "db_migration",
            CoreError::InvalidImport(_) => "invalid_import",
            CoreError::InvalidLook(_) => "look_invalid",
            CoreError::Sqlite(_) => "db",
            CoreError::Io(_) => "io",
            CoreError::Json(_) => "json",
        }
    }
}

impl From<rusqlite::Error> for CoreError {
    fn from(e: rusqlite::Error) -> Self {
        if let rusqlite::Error::SqliteFailure(f, _) = &e {
            if f.code == rusqlite::ErrorCode::DiskFull {
                return CoreError::DiskFull;
            }
        }
        CoreError::Sqlite(e)
    }
}
