use std::sync::atomic::AtomicBool;
use std::sync::{Mutex, MutexGuard, RwLock};
use std::time::Instant;

use posthaste_core::{Db, Settings};
use posthaste_platform::PreviousApp;

use crate::error::{AppError, AppResult};
use crate::shortcuts::ShortcutReport;

pub struct AppState {
    /// `None` when the database could not be opened; see `startup_error`.
    db: Mutex<Option<Db>>,
    pub startup_error: Option<AppError>,
    pub settings: RwLock<Settings>,
    pub shortcuts: Mutex<ShortcutReport>,
    /// The application that was focused when capture was last triggered.
    pub previous_app: Mutex<Option<PreviousApp>>,
    pub capture_shown_at: Mutex<Option<Instant>>,
    /// The application that was focused when the Today window was last
    /// opened. Kept separate from capture's so neither window's focus
    /// hand-off can touch the other's.
    pub today_previous_app: Mutex<Option<PreviousApp>>,
    pub today_shown_at: Mutex<Option<Instant>>,
    pub tray_available: AtomicBool,
}

impl AppState {
    pub fn new(db: Result<Db, AppError>) -> Self {
        let (db, startup_error) = match db {
            Ok(db) => (Some(db), None),
            Err(e) => (None, Some(e)),
        };
        let settings = db
            .as_ref()
            .and_then(|db| db.load_settings().ok())
            .unwrap_or_default();
        AppState {
            db: Mutex::new(db),
            startup_error,
            settings: RwLock::new(settings),
            shortcuts: Mutex::new(ShortcutReport::default()),
            previous_app: Mutex::new(None),
            capture_shown_at: Mutex::new(None),
            today_previous_app: Mutex::new(None),
            today_shown_at: Mutex::new(None),
            tray_available: AtomicBool::new(false),
        }
    }

    /// Runs `f` with the database, or reports why there is none.
    pub fn with_db<T>(&self, f: impl FnOnce(&mut Db) -> posthaste_core::Result<T>) -> AppResult<T> {
        let mut guard = lock(&self.db);
        match guard.as_mut() {
            Some(db) => f(db).map_err(AppError::from),
            None => Err(self
                .startup_error
                .clone()
                .unwrap_or_else(|| AppError::new("db_open", "The database is not available."))),
        }
    }

    pub fn settings(&self) -> Settings {
        self.settings
            .read()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }
}

/// Locks a mutex, recovering the data if another thread panicked while
/// holding it: a poisoned lock must never make notes unreachable.
pub fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}
