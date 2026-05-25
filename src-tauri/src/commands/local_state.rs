use crate::core::models::{
    CoreEnvelope, NotificationStatusPayload, PluginConfigEntryPayload, PluginConfigStatePayload,
    RemoteDevicePayload,
};
use crate::core::repository::Repository;
use serde_json::Value;
use std::sync::Mutex;
use tauri::State;

#[tauri::command]
pub fn load_notification_status(
    repo: State<'_, Mutex<Repository>>,
) -> Result<CoreEnvelope<NotificationStatusPayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    repo.load_notification_status()
        .map(CoreEnvelope::ok)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn mark_notification_read(
    repo: State<'_, Mutex<Repository>>,
    id: String,
) -> Result<CoreEnvelope<NotificationStatusPayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    repo.mark_notification_read(&id)
        .map(CoreEnvelope::ok)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn mark_all_notifications_read(
    repo: State<'_, Mutex<Repository>>,
) -> Result<CoreEnvelope<NotificationStatusPayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    repo.mark_all_notifications_read()
        .map(CoreEnvelope::ok)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn dismiss_notification(
    repo: State<'_, Mutex<Repository>>,
    id: String,
) -> Result<CoreEnvelope<NotificationStatusPayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    repo.dismiss_notification(&id)
        .map(CoreEnvelope::ok)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_remote_device_state(
    repo: State<'_, Mutex<Repository>>,
) -> Result<CoreEnvelope<RemoteDevicePayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    repo.load_remote_device_state()
        .map(CoreEnvelope::ok)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rotate_remote_device_key(
    repo: State<'_, Mutex<Repository>>,
) -> Result<CoreEnvelope<RemoteDevicePayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    repo.rotate_remote_device_key()
        .map(CoreEnvelope::ok)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_plugin_config_state(
    repo: State<'_, Mutex<Repository>>,
) -> Result<CoreEnvelope<PluginConfigStatePayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    Ok(CoreEnvelope::ok(repo.load_plugin_config_state()))
}

#[tauri::command]
pub fn save_plugin_config(
    repo: State<'_, Mutex<Repository>>,
    plugin_id: String,
    enabled: Option<bool>,
    pinned: Option<bool>,
    config: Option<Value>,
) -> Result<CoreEnvelope<PluginConfigEntryPayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    repo.save_plugin_config(&plugin_id, enabled, pinned, config)
        .map(CoreEnvelope::ok)
        .map_err(|e| e.to_string())
}
