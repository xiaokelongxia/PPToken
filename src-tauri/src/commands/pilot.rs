use crate::core::models::{
    CoreEnvelope, PilotAccountsPayload, PilotSessionDeletePayload, PilotSessionRestorePayload,
    PilotSessionsPayload,
};
use crate::core::pilot;
use crate::core::pilot::{
    AccountExportPayload, AccountImportPayload, AccountImportPreviewPayload, AccountRemovePayload,
    AccountSwitchPayload, RelayExportPayload, RelayImportPayload, RelayModelFetchPayload,
    RelayMutationPayload, RelayRouteDiagnosticPayload, RelayStatePayload, RelayTestPayload,
    RelayUpsertInput,
};
use crate::core::repository::Repository;
use std::sync::Mutex;
use tauri::State;

#[tauri::command]
pub fn load_pilot_accounts(
    repo: State<'_, Mutex<Repository>>,
) -> Result<CoreEnvelope<PilotAccountsPayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    pilot::load_accounts(repo.paths())
        .map(CoreEnvelope::ok)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_pilot_sessions(
    repo: State<'_, Mutex<Repository>>,
) -> Result<CoreEnvelope<PilotSessionsPayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    pilot::load_sessions(repo.paths())
        .map(CoreEnvelope::ok)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_sessions(
    repo: State<'_, Mutex<Repository>>,
    session_paths: Vec<String>,
) -> Result<CoreEnvelope<PilotSessionDeletePayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    pilot::delete_sessions(repo.paths(), session_paths)
        .map(CoreEnvelope::ok)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn recover_unindexed_sessions(
    repo: State<'_, Mutex<Repository>>,
) -> Result<CoreEnvelope<PilotSessionRestorePayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    pilot::recover_unindexed_sessions(repo.paths())
        .map(CoreEnvelope::ok)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn preview_account_import(
    repo: State<'_, Mutex<Repository>>,
    file_path: String,
) -> Result<CoreEnvelope<AccountImportPreviewPayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    pilot::preview_account_import(repo.paths(), &file_path)
        .map(CoreEnvelope::ok)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_accounts_from_file(
    repo: State<'_, Mutex<Repository>>,
    file_path: String,
    overwrite_existing: bool,
) -> Result<CoreEnvelope<AccountImportPayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    pilot::import_accounts_from_file(repo.paths(), &file_path, overwrite_existing)
        .map(CoreEnvelope::ok)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_accounts_to_file(
    repo: State<'_, Mutex<Repository>>,
    target_path: String,
    include_api_keys: bool,
) -> Result<CoreEnvelope<AccountExportPayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    pilot::export_accounts_to_file(repo.paths(), &target_path, include_api_keys)
        .map(CoreEnvelope::ok)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn switch_account(
    repo: State<'_, Mutex<Repository>>,
    account_key: String,
) -> Result<CoreEnvelope<AccountSwitchPayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    pilot::switch_account(repo.paths(), &account_key, false)
        .map(CoreEnvelope::ok)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn switch_account_and_restart_codex(
    repo: State<'_, Mutex<Repository>>,
    account_key: String,
) -> Result<CoreEnvelope<AccountSwitchPayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    pilot::switch_account_and_restart_codex(repo.paths(), &account_key)
        .map(CoreEnvelope::ok)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn logout(
    repo: State<'_, Mutex<Repository>>,
) -> Result<CoreEnvelope<AccountSwitchPayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    pilot::logout(repo.paths())
        .map(CoreEnvelope::ok)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_accounts(
    repo: State<'_, Mutex<Repository>>,
    account_keys: Vec<String>,
) -> Result<CoreEnvelope<AccountRemovePayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    pilot::remove_accounts(repo.paths(), account_keys)
        .map(CoreEnvelope::ok)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_relay_state(
    repo: State<'_, Mutex<Repository>>,
) -> Result<CoreEnvelope<RelayStatePayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    pilot::load_relay_state(repo.paths())
        .map(CoreEnvelope::ok)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_routing(
    repo: State<'_, Mutex<Repository>>,
) -> Result<CoreEnvelope<crate::core::models::PilotRoutingPayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    pilot::load_routing(repo.paths())
        .map(CoreEnvelope::ok)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn upsert_relay_provider(
    repo: State<'_, Mutex<Repository>>,
    input: RelayUpsertInput,
) -> Result<CoreEnvelope<RelayMutationPayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    pilot::upsert_relay_provider(repo.paths(), input)
        .map(CoreEnvelope::ok)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_relay_provider(
    repo: State<'_, Mutex<Repository>>,
    provider_id: String,
) -> Result<CoreEnvelope<RelayMutationPayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    pilot::delete_relay_provider(repo.paths(), &provider_id)
        .map(CoreEnvelope::ok)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn activate_relay_provider(
    repo: State<'_, Mutex<Repository>>,
    provider_id: String,
) -> Result<CoreEnvelope<RelayMutationPayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    pilot::activate_relay_provider(repo.paths(), &provider_id)
        .map(CoreEnvelope::ok)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn deactivate_relay_provider(
    repo: State<'_, Mutex<Repository>>,
    provider_id: String,
) -> Result<CoreEnvelope<RelayMutationPayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    pilot::deactivate_relay_provider(repo.paths(), &provider_id)
        .map(CoreEnvelope::ok)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_relay_provider_network(
    repo: State<'_, Mutex<Repository>>,
    provider_id: String,
    network: String,
) -> Result<CoreEnvelope<RelayMutationPayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    pilot::set_relay_provider_network(repo.paths(), &provider_id, &network)
        .map(CoreEnvelope::ok)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_codex_router_enabled(
    repo: State<'_, Mutex<Repository>>,
    enabled: bool,
) -> Result<CoreEnvelope<RelayStatePayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    pilot::set_codex_router_enabled(repo.paths(), enabled)
        .map(CoreEnvelope::ok)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn test_relay_provider(
    repo: State<'_, Mutex<Repository>>,
    provider_id: String,
) -> Result<CoreEnvelope<RelayTestPayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    pilot::test_relay_provider(repo.paths(), &provider_id)
        .map(CoreEnvelope::ok)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_relay_proxy_status(
    repo: State<'_, Mutex<Repository>>,
) -> Result<CoreEnvelope<pilot::RelayProxyState>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    pilot::get_relay_proxy_status(repo.paths())
        .map(CoreEnvelope::ok)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn diagnose_codex_router(
    repo: State<'_, Mutex<Repository>>,
) -> Result<CoreEnvelope<RelayRouteDiagnosticPayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    pilot::diagnose_codex_router(repo.paths())
        .map(CoreEnvelope::ok)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn run_codex_router_diagnostics(
    repo: State<'_, Mutex<Repository>>,
) -> Result<CoreEnvelope<RelayRouteDiagnosticPayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    pilot::run_codex_router_diagnostics(repo.paths())
        .map(CoreEnvelope::ok)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn fix_codex_router_issue(
    repo: State<'_, Mutex<Repository>>,
) -> Result<CoreEnvelope<RelayRouteDiagnosticPayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    pilot::fix_codex_router_issue(repo.paths())
        .map(CoreEnvelope::ok)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_relay_config(
    repo: State<'_, Mutex<Repository>>,
) -> Result<CoreEnvelope<RelayExportPayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    pilot::export_relay_config(repo.paths())
        .map(CoreEnvelope::ok)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_relay_config(
    repo: State<'_, Mutex<Repository>>,
    file_path: String,
) -> Result<CoreEnvelope<RelayImportPayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    pilot::import_relay_config(repo.paths(), &file_path)
        .map(CoreEnvelope::ok)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn fetch_relay_models_draft(
    repo: State<'_, Mutex<Repository>>,
    provider_id: String,
) -> Result<CoreEnvelope<RelayModelFetchPayload>, String> {
    let repo = repo.lock().map_err(|e| e.to_string())?;
    pilot::fetch_relay_models_draft(repo.paths(), &provider_id)
        .map(CoreEnvelope::ok)
        .map_err(|e| e.to_string())
}
