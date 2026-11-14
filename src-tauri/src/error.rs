use posthaste_core::CoreError;
use serde::Serialize;

/// The error shape every command returns to the frontend: a stable `code`
/// to branch on and a `message` written for the person using the app.
#[derive(Debug, Clone, Serialize)]
pub struct AppError {
    pub code: String,
    pub message: String,
}

impl AppError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        AppError {
            code: code.into(),
            message: message.into(),
        }
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} ({})", self.message, self.code)
    }
}

impl From<CoreError> for AppError {
    fn from(e: CoreError) -> Self {
        // Messages describe the failure, never the note text.
        log::error!("storage error [{}]: {e}", e.code());
        AppError::new(e.code(), e.to_string())
    }
}

impl From<tauri::Error> for AppError {
    fn from(e: tauri::Error) -> Self {
        log::error!("window system error: {e}");
        AppError::new("native", e.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
