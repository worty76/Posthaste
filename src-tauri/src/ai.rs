//! Optional AI note polishing: sends the note text to the provider the user
//! picked and returns a tidier version. Off unless a provider and API key
//! are configured; the request goes from this machine straight to the
//! provider, using the user's own key. Nothing runs or is sent automatically.

use posthaste_core::{AiProvider, Settings};
use serde_json::json;
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

const SYSTEM_PROMPT: &str = "You tidy up quick notes typed in a hurry. Fix spelling and \
grammar, keep the original meaning and language, and keep it short. Reply with ONLY the \
polished note text — no quotes, no explanation, no extra lines.";

const REQUEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(60);

/// Small, fast defaults per provider; the user can override the model in
/// Settings.
fn default_model(provider: AiProvider) -> &'static str {
    match provider {
        AiProvider::Anthropic => "claude-haiku-4-5",
        AiProvider::OpenAI => "gpt-4o-mini",
        AiProvider::Gemini => "gemini-2.0-flash",
        AiProvider::None => "",
    }
}

/// The configuration a polish request needs, checked before any network call.
#[derive(Debug)]
struct AiConfig {
    provider: AiProvider,
    api_key: String,
    model: String,
}

fn ai_config(settings: &Settings) -> Result<AiConfig, AppError> {
    if settings.ai_provider == AiProvider::None {
        return Err(AppError::new(
            "ai_not_configured",
            "AI polish is not set up. Pick a provider and add your API key in Settings.",
        ));
    }
    let key = settings.ai_api_key.trim().to_string();
    if key.is_empty() {
        return Err(AppError::new(
            "ai_not_configured",
            "AI polish needs an API key. Add yours in Settings.",
        ));
    }
    let model = {
        let chosen = settings.ai_model.trim().to_string();
        if chosen.is_empty() {
            default_model(settings.ai_provider).to_string()
        } else {
            chosen
        }
    };
    Ok(AiConfig {
        provider: settings.ai_provider,
        api_key: key,
        model,
    })
}

fn build_request_body(cfg: &AiConfig, text: &str) -> serde_json::Value {
    match cfg.provider {
        AiProvider::Anthropic => json!({
            "model": cfg.model,
            "max_tokens": 1024,
            "system": SYSTEM_PROMPT,
            "messages": [{ "role": "user", "content": text }]
        }),
        AiProvider::OpenAI => json!({
            "model": cfg.model,
            "messages": [
                { "role": "system", "content": SYSTEM_PROMPT },
                { "role": "user", "content": text }
            ]
        }),
        AiProvider::Gemini => json!({
            "contents": [{ "parts": [{ "text": format!("{SYSTEM_PROMPT}\n\n{text}") }] }]
        }),
        AiProvider::None => json!({}),
    }
}

async fn request_polish(cfg: &AiConfig, text: &str) -> AppResult<String> {
    let client = reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|e| {
            AppError::new(
                "ai_network",
                format!("The AI client could not start. ({e})"),
            )
        })?;
    let endpoint = match cfg.provider {
        AiProvider::Anthropic => "https://api.anthropic.com/v1/messages".to_string(),
        AiProvider::OpenAI => "https://api.openai.com/v1/chat/completions".to_string(),
        AiProvider::Gemini => format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent",
            cfg.model
        ),
        AiProvider::None => unreachable!("checked in ai_config"),
    };
    let mut req = client
        .post(endpoint)
        .json(&build_request_body(cfg, text))
        .header("Accept", "application/json");
    match cfg.provider {
        AiProvider::Anthropic => {
            req = req
                .header("x-api-key", &cfg.api_key)
                .header("anthropic-version", "2023-06-01");
        }
        AiProvider::OpenAI => {
            req = req.header("Authorization", format!("Bearer {}", cfg.api_key));
        }
        AiProvider::Gemini => {
            req = req.header("x-goog-api-key", &cfg.api_key);
        }
        AiProvider::None => unreachable!("checked in ai_config"),
    }

    let response = req.send().await.map_err(|e| {
        AppError::new(
            "ai_network",
            format!("Could not reach the AI provider. Check your internet connection. ({e})"),
        )
    })?;

    let status = response.status();
    if !status.is_success() {
        return Err(AppError::new(
            "ai_provider_error",
            format!(
                "The AI provider returned an error (HTTP {status}). Check the API key and model \
                 in Settings."
            ),
        ));
    }

    let value: serde_json::Value = response.json().await.map_err(|e| {
        AppError::new(
            "ai_provider_error",
            format!("The AI provider sent a response this app could not read. ({e})"),
        )
    })?;

    // Every provider nests the text a little differently; pull the first
    // non-empty piece out.
    let text = match cfg.provider {
        AiProvider::Anthropic => value["content"][0]["text"]
            .as_str()
            .unwrap_or_default()
            .trim()
            .to_string(),
        AiProvider::OpenAI => value["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or_default()
            .trim()
            .to_string(),
        AiProvider::Gemini => value["candidates"][0]["content"]["parts"][0]["text"]
            .as_str()
            .unwrap_or_default()
            .trim()
            .to_string(),
        AiProvider::None => String::new(),
    };
    if text.is_empty() {
        return Err(AppError::new(
            "ai_provider_error",
            "The AI returned an empty response. Try again.",
        ));
    }
    Ok(text)
}

/// Tauri command: polishes the note text with the configured provider.
#[tauri::command]
pub async fn ai_polish(state: State<'_, AppState>, text: String) -> AppResult<String> {
    let settings = state.settings();
    if text.trim().is_empty() {
        return Err(AppError::new(
            "empty_note",
            "Nothing to polish — the note is empty.",
        ));
    }
    let cfg = ai_config(&settings)?;
    let polished = request_polish(&cfg, text.trim()).await?;
    Ok(polished)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settings(provider: AiProvider, key: &str, model: &str) -> Settings {
        Settings {
            ai_provider: provider,
            ai_api_key: key.into(),
            ai_model: model.into(),
            ..Settings::default()
        }
    }

    #[test]
    fn provider_none_is_not_configured() {
        let err = ai_config(&settings(AiProvider::None, "key", "")).unwrap_err();
        assert_eq!(err.code, "ai_not_configured");
    }

    #[test]
    fn provider_without_key_is_not_configured() {
        let err = ai_config(&settings(AiProvider::Anthropic, "   ", "")).unwrap_err();
        assert_eq!(err.code, "ai_not_configured");
    }

    #[test]
    fn empty_model_falls_back_to_the_provider_default() {
        let cfg = ai_config(&settings(AiProvider::OpenAI, "key", "")).unwrap();
        assert_eq!(cfg.model, "gpt-4o-mini");
        let cfg = ai_config(&settings(AiProvider::Anthropic, "key", "my-model")).unwrap();
        assert_eq!(cfg.model, "my-model");
    }

    #[test]
    fn the_prompt_travels_with_the_note() {
        let body = build_request_body(
            &ai_config(&settings(AiProvider::Anthropic, "key", "m")).unwrap(),
            "my rough note",
        );
        assert_eq!(body["messages"][0]["content"], "my rough note");
        assert_eq!(body["system"], SYSTEM_PROMPT);
        assert_eq!(body["model"], "m");
    }
}
