use crate::core::admin_content;
use crate::core::models::*;
use crate::core::repository::Repository;
use std::sync::Mutex;
use tauri::State;

#[tauri::command]
pub fn load_admin_content(
    repo: State<'_, Mutex<Repository>>,
) -> Result<CoreEnvelope<AdminContentPayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    let paths = repo.paths();
    let content =
        admin_content::load_admin_content(&paths.admin_content_path).map_err(|e| e.to_string())?;
    Ok(CoreEnvelope::ok(AdminContentPayload {
        updated_at: content.updated_at,
        content,
        source_path: paths.admin_content_path.display().to_string(),
    }))
}

#[tauri::command]
pub fn save_admin_content(
    repo: State<'_, Mutex<Repository>>,
    content: AdminContentFile,
) -> Result<CoreEnvelope<AdminContentPayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    let paths = repo.paths();
    let saved = admin_content::save_admin_content(&paths.admin_content_path, content)
        .map_err(|e| e.to_string())?;
    Ok(CoreEnvelope::ok(AdminContentPayload {
        updated_at: saved.updated_at,
        content: saved,
        source_path: paths.admin_content_path.display().to_string(),
    }))
}

#[tauri::command]
pub fn submit_topbar_feedback(
    repo: State<'_, Mutex<Repository>>,
    text: String,
) -> Result<CoreEnvelope<FeedbackSubmitPayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    let paths = repo.paths();
    let (content, item) = admin_content::submit_feedback(&paths.admin_content_path, text)
        .map_err(|e| e.to_string())?;
    Ok(CoreEnvelope::ok(FeedbackSubmitPayload {
        item,
        total: content.feedback_items.len() as i32,
        source_path: paths.admin_content_path.display().to_string(),
    }))
}

#[tauri::command]
pub fn verify_mystery_code(
    repo: State<'_, Mutex<Repository>>,
    code: String,
) -> Result<CoreEnvelope<MysteryCodeVerifyPayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    let paths = repo.paths();
    let payload = admin_content::verify_mystery_code(&paths.admin_content_path, code)
        .map_err(|e| e.to_string())?;
    Ok(CoreEnvelope::ok(payload))
}

#[tauri::command]
pub fn load_plugin_state(
    repo: State<'_, Mutex<Repository>>,
) -> Result<CoreEnvelope<PluginStatePayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    let paths = repo.paths();
    let payload = admin_content::load_plugin_state(&paths.plugins_dir, &paths.admin_content_path)
        .map_err(|e| e.to_string())?;
    Ok(CoreEnvelope::ok(payload))
}
