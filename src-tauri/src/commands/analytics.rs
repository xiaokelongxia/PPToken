use crate::core::analytics::{self, QuotaHistoryPayload, UsageAnalyticsPayload};
use crate::core::models::{
    ChangeAnalyticsPayload, CoreEnvelope, TokenAnalyticsPayload, ToolAnalyticsPayload,
};
use crate::core::repository::Repository;
use std::sync::Mutex;
use tauri::State;

#[tauri::command]
pub fn load_usage_analytics(
    repo: State<'_, Mutex<Repository>>,
    range: Option<String>,
) -> Result<CoreEnvelope<UsageAnalyticsPayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    let payload = analytics::load_usage_analytics(repo.paths(), range.as_deref())
        .map_err(|e| e.to_string())?;
    let _ = repo.store_bootstrap_usage_analytics(&payload);
    Ok(CoreEnvelope::ok(payload))
}

#[tauri::command]
pub fn load_quota_history(
    repo: State<'_, Mutex<Repository>>,
) -> Result<CoreEnvelope<QuotaHistoryPayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    Ok(CoreEnvelope::ok(analytics::load_quota_history(
        repo.paths(),
    )))
}

#[tauri::command]
pub fn load_session_analytics(
    repo: State<'_, Mutex<Repository>>,
    range: Option<String>,
) -> Result<CoreEnvelope<UsageAnalyticsPayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    analytics::load_usage_analytics(repo.paths(), range.as_deref())
        .map(CoreEnvelope::ok)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_token_analytics(
    repo: State<'_, Mutex<Repository>>,
    range: Option<String>,
) -> Result<CoreEnvelope<TokenAnalyticsPayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    analytics::load_token_analytics(repo.paths(), range.as_deref())
        .map(CoreEnvelope::ok)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_tool_analytics(
    repo: State<'_, Mutex<Repository>>,
    range: Option<String>,
) -> Result<CoreEnvelope<ToolAnalyticsPayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    analytics::load_tool_analytics(repo.paths(), range.as_deref())
        .map(CoreEnvelope::ok)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_change_analytics(
    repo: State<'_, Mutex<Repository>>,
    range: Option<String>,
) -> Result<CoreEnvelope<ChangeAnalyticsPayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    analytics::load_change_analytics(repo.paths(), range.as_deref())
        .map(CoreEnvelope::ok)
        .map_err(|e| e.to_string())
}
