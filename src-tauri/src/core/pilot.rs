use crate::core::auth::current_timestamp;
use crate::core::models::{
    CoreError, PilotAccountSummary, PilotAccountsPayload, PilotModelProviderSummary,
    PilotRoutingPayload, PilotSessionDeletePayload, PilotSessionRestorePayload,
    PilotSessionSummary, PilotSessionsPayload,
};
use crate::core::quota_store;
use crate::platform::paths::CodexPaths;
use rusqlite::{params, Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

const ACCOUNTS_EXPORT_KIND: &str = "pptoken-accounts";
const ACCOUNTS_EXPORT_SCHEMA_VERSION: i32 = 1;
const RELAY_STATE_SCHEMA_VERSION: i32 = 1;
const RELAY_MANAGED_BEGIN: &str = "# >>> pptoken-relay managed start (DO NOT EDIT MANUALLY)";
const RELAY_MANAGED_END: &str = "# <<< pptoken-relay managed end";
const RELAY_TOP_BEGIN: &str = "# >>> pptoken-relay codex-router top start (DO NOT EDIT MANUALLY)";
const RELAY_TOP_END: &str = "# <<< pptoken-relay codex-router top end";
const RELAY_PROFILE: &str = "pptoken_relay";
const RELAY_CODEX_PROVIDER: &str = "pptoken_codex_router";
const RELAY_OPENAI_WIRE_API: &str = "responses";
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegistryFile {
    active_account_key: Option<String>,
    #[serde(default)]
    items: Vec<RegistryItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegistryItem {
    account_key: String,
    snapshot_path: String,
    email: Option<String>,
    alias: Option<String>,
    account_name: Option<String>,
    workspace_name: Option<String>,
    profile_name: Option<String>,
    plan: Option<String>,
    auth_mode: Option<String>,
    has_active_subscription: Option<bool>,
    subscription_expires_at: Option<i64>,
    subscription_will_renew: Option<bool>,
    created_at: Option<i64>,
    last_used_at: Option<i64>,
    last_usage_at: Option<i64>,
    cached_primary_window: Option<crate::core::models::RateLimitWindow>,
    cached_secondary_window: Option<crate::core::models::RateLimitWindow>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountImportPreviewPayload {
    pub account_count: i32,
    pub accounts: Vec<PilotAccountSummary>,
    pub source_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountImportPayload {
    pub imported_account_keys: Vec<String>,
    pub registry_account_count: i32,
    pub source_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountExportPayload {
    pub target_path: String,
    pub account_count: i32,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountSwitchPayload {
    pub switched_account_key: String,
    pub restart_requested: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountRemovePayload {
    pub deleted_ids: Vec<String>,
    pub deleted_count: i32,
    pub registry_account_count: i32,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AccountsExportFile {
    schema_version: i32,
    kind: String,
    app_version: String,
    exported_at: i64,
    exported_by: String,
    include_api_keys: bool,
    accounts: Vec<ExportedAccount>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportedAccount {
    account_key: String,
    snapshot: Value,
    email: Option<String>,
    alias: Option<String>,
    account_name: Option<String>,
    workspace_name: Option<String>,
    profile_name: Option<String>,
    plan: Option<String>,
    auth_mode: Option<String>,
    has_active_subscription: Option<bool>,
    subscription_expires_at: Option<i64>,
    subscription_will_renew: Option<bool>,
    created_at: Option<i64>,
    last_used_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RelayStateFile {
    #[serde(default = "relay_state_schema_version")]
    pub schema_version: i32,
    #[serde(default)]
    pub codex_router_enabled: bool,
    #[serde(default)]
    pub active_by_ide: HashMap<String, String>,
    #[serde(default)]
    pub providers: Vec<RelayProvider>,
    #[serde(default)]
    pub proxy: RelayProxyState,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RelayProxyState {
    #[serde(default)]
    pub running: bool,
    #[serde(default)]
    pub port: Option<u16>,
    #[serde(default)]
    pub codex_base_url: Option<String>,
}

impl Default for RelayProxyState {
    fn default() -> Self {
        Self {
            running: false,
            port: None,
            codex_base_url: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RelayProvider {
    pub id: String,
    pub name: String,
    pub ide: String,
    pub base_url: String,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub api_key_stored: bool,
    pub model: String,
    pub wire_api: String,
    #[serde(default)]
    pub extra_headers: HashMap<String, String>,
    #[serde(default = "default_relay_network")]
    pub network: String,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub health_score: Option<i32>,
    #[serde(default)]
    pub latency_ms: Option<i64>,
    #[serde(default)]
    pub last_tested_at: Option<i64>,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub updated_at: i64,
    #[serde(default)]
    pub last_error: Option<String>,
    #[serde(default)]
    pub error_message: Option<String>,
    #[serde(default)]
    pub models: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayUpsertInput {
    pub id: String,
    pub name: String,
    #[serde(default = "default_relay_ide")]
    pub ide: String,
    pub base_url: String,
    #[serde(default)]
    pub api_key: Option<String>,
    pub model: String,
    pub wire_api: String,
    #[serde(default)]
    pub extra_headers: HashMap<String, String>,
    #[serde(default = "default_relay_network")]
    pub network: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayStatePayload {
    pub codex_router_enabled: bool,
    pub active_by_ide: HashMap<String, String>,
    pub proxy: RelayProxyState,
    pub providers: Vec<RelayProvider>,
    pub state_path: String,
    pub config_path: String,
    pub last_scan_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayMutationPayload {
    pub state: RelayStatePayload,
    pub provider: Option<RelayProvider>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayTestPayload {
    pub provider_id: String,
    pub reachable: bool,
    pub status_code: Option<i32>,
    pub latency_ms: Option<i64>,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayRouteDiagnosticPayload {
    pub router_enabled: bool,
    pub proxy_running: bool,
    pub proxy_port: Option<u16>,
    pub active_provider: Option<String>,
    pub active_model: Option<String>,
    pub provider_count: i32,
    pub catalog_exists: bool,
    pub config_has_router: bool,
    pub state_path: String,
    pub config_path: String,
    pub catalog_path: String,
    pub issues: Vec<String>,
    pub suggestions: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayModelFetchPayload {
    pub provider_id: String,
    pub models: Vec<String>,
    pub endpoint: String,
    pub status_code: Option<i32>,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayExportPayload {
    pub file_path: String,
    pub provider_count: i32,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayImportPayload {
    pub imported_count: i32,
    pub skipped: Vec<String>,
    pub state: RelayStatePayload,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RelayExportFile {
    schema_version: i32,
    kind: String,
    app_version: String,
    exported_at: i64,
    exported_by: String,
    include_api_keys: bool,
    codex_router_enabled: bool,
    active_by_ide: HashMap<String, String>,
    proxy: RelayProxyState,
    providers: Vec<RelayProvider>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RelayImportFile {
    #[allow(dead_code)]
    schema_version: Option<i32>,
    kind: Option<String>,
    codex_router_enabled: Option<bool>,
    active_by_ide: Option<HashMap<String, String>>,
    proxy: Option<RelayProxyState>,
    providers: Vec<RelayProvider>,
}

fn relay_state_schema_version() -> i32 {
    RELAY_STATE_SCHEMA_VERSION
}

fn default_relay_ide() -> String {
    "codex".to_string()
}

fn default_relay_network() -> String {
    "direct".to_string()
}

pub fn load_accounts(paths: &CodexPaths) -> Result<PilotAccountsPayload, String> {
    let raw = fs::read_to_string(&paths.registry_path)
        .map_err(|e| format!("read account registry failed: {e}"))?;
    let registry: RegistryFile =
        serde_json::from_str(&raw).map_err(|e| format!("parse account registry failed: {e}"))?;
    let quota_store = quota_store::load_or_default(&paths.quota_store_path);
    let relay_state = load_relay_state_file(paths).ok();

    let items = registry
        .items
        .iter()
        .map(|item| {
            let snapshot = read_json_if_exists(Path::new(&item.snapshot_path));
            let quota = quota_store::find_item(&quota_store, &item.account_key);
            let relay_provider = relay_provider_for_snapshot(snapshot.as_ref(), relay_state.as_ref());
            let relay_provider_id = relay_provider.map(|provider| provider.id.clone());
            let relay_provider_name = relay_provider.map(|provider| provider.name.clone());
            let relay_provider_base_url = relay_provider.map(|provider| provider.base_url.clone());
            PilotAccountSummary {
                account_key: item.account_key.clone(),
                email: item.email.clone(),
                alias: item.alias.clone(),
                account_name: item.account_name.clone(),
                workspace_name: item.workspace_name.clone(),
                profile_name: item.profile_name.clone(),
                plan: item.plan.clone(),
                auth_mode: item.auth_mode.clone(),
                active: registry.active_account_key.as_deref() == Some(item.account_key.as_str()),
                snapshot_path: item.snapshot_path.clone(),
                created_at: item.created_at,
                last_used_at: item.last_used_at,
                last_usage_at: item.last_usage_at,
                has_api_key: json_has_key(&snapshot, "OPENAI_API_KEY"),
                has_refresh_token: json_has_nested_key(&snapshot, &["tokens", "refresh_token"])
                    || json_has_key(&snapshot, "refresh_token"),
                has_active_subscription: item.has_active_subscription,
                subscription_expires_at: item.subscription_expires_at,
                subscription_will_renew: item.subscription_will_renew,
                usage_source: quota.map(|q| q.usage_source.clone()),
                primary_window: quota
                    .and_then(|q| q.primary_window.clone())
                    .or_else(|| item.cached_primary_window.clone()),
                secondary_window: quota
                    .and_then(|q| q.secondary_window.clone())
                    .or_else(|| item.cached_secondary_window.clone()),
                token_status: quota.and_then(|q| q.token_status.clone()),
                relay_provider_id,
                relay_provider_name,
                relay_provider_base_url,
            }
        })
        .collect::<Vec<_>>();

    Ok(PilotAccountsPayload {
        total: items.len() as i32,
        items,
        active_account_key: registry.active_account_key,
        source_path: paths.registry_path.display().to_string(),
        last_scan_at: current_timestamp(),
    })
}

pub fn preview_account_import(
    _paths: &CodexPaths,
    file_path: &str,
) -> Result<AccountImportPreviewPayload, CoreError> {
    let export = read_accounts_export(file_path)?;
    let items = export
        .accounts
        .iter()
        .map(|account| exported_account_summary(account, false, String::new()))
        .collect::<Vec<_>>();
    Ok(AccountImportPreviewPayload {
        account_count: items.len() as i32,
        accounts: items,
        source_path: Path::new(file_path).display().to_string(),
    })
}

pub fn import_accounts_from_file(
    paths: &CodexPaths,
    file_path: &str,
    overwrite_existing: bool,
) -> Result<AccountImportPayload, CoreError> {
    let export = read_accounts_export(file_path)?;
    paths.ensure_directories()?;
    let mut registry = load_repository_registry(paths);
    let mut imported = Vec::new();
    let now = current_timestamp();

    for account in export.accounts {
        let snapshot_path = account_snapshot_path(paths, &account.account_key);
        if snapshot_path.exists() && !overwrite_existing {
            continue;
        }
        let snapshot_data = serde_json::to_string_pretty(&account.snapshot)?;
        fs::write(&snapshot_path, snapshot_data)?;
        let snapshot_path_string = snapshot_path.display().to_string();
        let item = repository_item_from_export(&account, &snapshot_path_string, now);

        if let Some(existing) = registry
            .items
            .iter_mut()
            .find(|existing| existing.account_key == item.account_key)
        {
            if overwrite_existing {
                *existing = item;
            }
        } else {
            registry.items.push(item);
        }
        imported.push(account.account_key);
    }

    if registry.active_account_key.is_none() {
        registry.active_account_key = registry.items.first().map(|item| item.account_key.clone());
    }
    registry.items.sort_by(|a, b| {
        a.email
            .to_lowercase()
            .cmp(&b.email.to_lowercase())
            .then_with(|| a.account_key.cmp(&b.account_key))
    });
    registry.updated_at = now;
    save_repository_registry(paths, &registry)?;

    Ok(AccountImportPayload {
        imported_account_keys: imported,
        registry_account_count: registry.items.len() as i32,
        source_path: Path::new(file_path).display().to_string(),
    })
}

pub fn export_accounts_to_file(
    paths: &CodexPaths,
    target_path: &str,
    include_api_keys: bool,
) -> Result<AccountExportPayload, CoreError> {
    let registry = load_repository_registry(paths);
    if registry.items.is_empty() {
        return Err(CoreError::NotFound("No accounts to export".into()));
    }
    let mut accounts = Vec::new();
    for item in registry.items {
        let snapshot_path = Path::new(&item.snapshot_path);
        let mut snapshot = read_json_if_exists(snapshot_path).unwrap_or(Value::Null);
        if !include_api_keys {
            redact_auth_snapshot(&mut snapshot);
        }
        accounts.push(ExportedAccount {
            account_key: item.account_key,
            snapshot,
            email: Some(item.email),
            alias: Some(item.alias),
            account_name: item.account_name,
            workspace_name: item.workspace_name,
            profile_name: item.profile_name,
            plan: Some(item.plan),
            auth_mode: Some(item.auth_mode),
            has_active_subscription: item.has_active_subscription,
            subscription_expires_at: item.subscription_expires_at,
            subscription_will_renew: item.subscription_will_renew,
            created_at: Some(item.created_at),
            last_used_at: item.last_used_at,
        });
    }

    let file = AccountsExportFile {
        schema_version: ACCOUNTS_EXPORT_SCHEMA_VERSION,
        kind: ACCOUNTS_EXPORT_KIND.to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        exported_at: current_timestamp(),
        exported_by: "PPToken".to_string(),
        include_api_keys,
        accounts,
    };
    let target = Path::new(target_path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(target, serde_json::to_string_pretty(&file)?)?;
    Ok(AccountExportPayload {
        target_path: target.display().to_string(),
        account_count: file.accounts.len() as i32,
    })
}

pub fn switch_account(
    paths: &CodexPaths,
    account_key: &str,
    restart_codex: bool,
) -> Result<AccountSwitchPayload, CoreError> {
    let mut registry = load_repository_registry(paths);
    let snapshot_path = registry
        .items
        .iter()
        .find(|item| item.account_key == account_key)
        .map(|item| item.snapshot_path.clone())
        .ok_or_else(|| CoreError::NotFound(format!("Account not found: {account_key}")))?;

    let snapshot_path = Path::new(&snapshot_path);
    if !snapshot_path.exists() {
        return Err(CoreError::NotFound(format!(
            "Account snapshot missing: {}",
            snapshot_path.display()
        )));
    }
    backup_current_auth(paths)?;
    fs::copy(snapshot_path, &paths.auth_path)?;
    let now = current_timestamp();
    registry.active_account_key = Some(account_key.to_string());
    for item in &mut registry.items {
        if item.account_key == account_key {
            item.last_used_at = Some(now);
        }
    }
    registry.updated_at = now;
    save_repository_registry(paths, &registry)?;

    if restart_codex {
        crate::platform::process::restart_codex_app()?;
    }

    Ok(AccountSwitchPayload {
        switched_account_key: account_key.to_string(),
        restart_requested: restart_codex,
    })
}

pub fn switch_account_and_restart_codex(
    paths: &CodexPaths,
    account_key: &str,
) -> Result<AccountSwitchPayload, CoreError> {
    switch_account(paths, account_key, true)
}

pub fn logout(paths: &CodexPaths) -> Result<AccountSwitchPayload, CoreError> {
    backup_current_auth(paths)?;
    if paths.auth_path.exists() {
        fs::remove_file(&paths.auth_path)?;
    }
    let mut registry = load_repository_registry(paths);
    registry.active_account_key = None;
    registry.updated_at = current_timestamp();
    save_repository_registry(paths, &registry)?;
    Ok(AccountSwitchPayload {
        switched_account_key: String::new(),
        restart_requested: false,
    })
}

pub fn remove_accounts(
    paths: &CodexPaths,
    account_keys: Vec<String>,
) -> Result<AccountRemovePayload, CoreError> {
    let mut registry = load_repository_registry(paths);
    let keys = account_keys
        .into_iter()
        .collect::<std::collections::HashSet<_>>();
    let mut deleted = Vec::new();
    registry.items.retain(|item| {
        if keys.contains(&item.account_key) {
            let _ = fs::remove_file(&item.snapshot_path);
            deleted.push(item.account_key.clone());
            false
        } else {
            true
        }
    });
    if registry
        .active_account_key
        .as_ref()
        .map(|active| keys.contains(active))
        .unwrap_or(false)
    {
        registry.active_account_key = None;
    }
    registry.updated_at = current_timestamp();
    save_repository_registry(paths, &registry)?;
    Ok(AccountRemovePayload {
        deleted_count: deleted.len() as i32,
        deleted_ids: deleted,
        registry_account_count: registry.items.len() as i32,
    })
}

pub fn load_sessions(paths: &CodexPaths) -> Result<PilotSessionsPayload, String> {
    if let Ok(items) = load_indexed_threads(paths) {
        return Ok(PilotSessionsPayload {
            total: items.len() as i32,
            items,
            source_path: paths.codex_state_db_path.display().to_string(),
            last_scan_at: current_timestamp(),
        });
    }

    let mut files = Vec::new();
    collect_jsonl_files(&paths.sessions_dir, &mut files)?;
    files.sort_by_key(|path| {
        fs::metadata(path)
            .and_then(|meta| meta.modified())
            .ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|duration| duration.as_secs())
            .unwrap_or(0)
    });
    files.reverse();

    let items = files
        .into_iter()
        .take(300)
        .filter_map(|path| summarize_session_file(&path))
        .collect::<Vec<_>>();

    Ok(PilotSessionsPayload {
        total: items.len() as i32,
        items,
        source_path: paths.sessions_dir.display().to_string(),
        last_scan_at: current_timestamp(),
    })
}

pub fn delete_sessions(
    paths: &CodexPaths,
    session_paths: Vec<String>,
) -> Result<PilotSessionDeletePayload, CoreError> {
    let mut deleted_paths = Vec::new();
    let mut archived_count = 0;
    if let Some(connection) = open_codex_state_db_rw(paths)? {
        for session_path in session_paths {
            let now = current_timestamp();
            let changed = connection
                .execute(
                    "UPDATE threads SET archived = 1, archived_at = ?1 WHERE rollout_path = ?2 AND archived = 0",
                    params![now, session_path],
                )
                .map_err(|e| CoreError::OperationFailed(format!("archive thread index failed: {e}")))?;
            if changed > 0 {
                deleted_paths.push(session_path);
                archived_count += changed as i32;
            }
        }
        return Ok(PilotSessionDeletePayload {
            deleted_paths,
            deleted_count: archived_count,
            archived_count,
            source_path: paths.codex_state_db_path.display().to_string(),
        });
    }

    for session_path in session_paths {
        let source = Path::new(&session_path);
        if !source.exists() {
            continue;
        }
        let relative = source
            .strip_prefix(&paths.sessions_dir)
            .map_err(|_| {
                CoreError::InvalidData(format!(
                    "Session path is outside sessions dir: {}",
                    source.display()
                ))
            })?
            .to_path_buf();
        let archive_target = unique_path(paths.archived_sessions_dir.join(relative));
        if let Some(parent) = archive_target.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::rename(source, &archive_target)?;
        deleted_paths.push(session_path);
        archived_count += 1;
    }
    Ok(PilotSessionDeletePayload {
        deleted_paths,
        deleted_count: archived_count,
        archived_count,
        source_path: paths.sessions_dir.display().to_string(),
    })
}

pub fn recover_unindexed_sessions(
    paths: &CodexPaths,
) -> Result<PilotSessionRestorePayload, CoreError> {
    if let Some(connection) = open_codex_state_db_rw(paths)? {
        let mut restored_paths = Vec::new();
        let mut statement = connection
            .prepare("SELECT rollout_path FROM threads WHERE archived = 1 ORDER BY COALESCE(updated_at_ms, updated_at * 1000) DESC")
            .map_err(|e| CoreError::OperationFailed(format!("read archived threads failed: {e}")))?;
        let paths_to_restore = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| CoreError::OperationFailed(format!("read archived threads failed: {e}")))?
            .filter_map(Result::ok)
            .collect::<Vec<_>>();
        drop(statement);

        for rollout_path in paths_to_restore {
            let changed = connection
                .execute(
                    "UPDATE threads SET archived = 0, archived_at = NULL WHERE rollout_path = ?1 AND archived = 1",
                    params![rollout_path],
                )
                .map_err(|e| CoreError::OperationFailed(format!("restore thread index failed: {e}")))?;
            if changed > 0 {
                restored_paths.push(rollout_path);
            }
        }

        return Ok(PilotSessionRestorePayload {
            restored_count: restored_paths.len() as i32,
            restored_paths,
            source_path: paths.codex_state_db_path.display().to_string(),
        });
    }

    let mut restored_paths = Vec::new();
    if !paths.archived_sessions_dir.exists() {
        return Ok(PilotSessionRestorePayload {
            restored_paths,
            restored_count: 0,
            source_path: paths.archived_sessions_dir.display().to_string(),
        });
    }

    let mut files = Vec::new();
    collect_jsonl_files(&paths.archived_sessions_dir, &mut files)
        .map_err(CoreError::OperationFailed)?;
    for source in files {
        let relative = source
            .strip_prefix(&paths.archived_sessions_dir)
            .ok()
            .unwrap_or(source.as_path())
            .to_path_buf();
        let target = paths.sessions_dir.join(relative);
        let target = unique_path(target);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::rename(&source, &target)?;
        restored_paths.push(target.display().to_string());
    }

    Ok(PilotSessionRestorePayload {
        restored_count: restored_paths.len() as i32,
        restored_paths,
        source_path: paths.archived_sessions_dir.display().to_string(),
    })
}

fn unique_path(path: PathBuf) -> PathBuf {
    if !path.exists() {
        return path;
    }
    let parent = path.parent().map(Path::to_path_buf).unwrap_or_default();
    let stem = path
        .file_stem()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| "session".to_string());
    let extension = path.extension().map(|value| value.to_string_lossy().to_string());
    for index in 1..10_000 {
        let file_name = match &extension {
            Some(ext) => format!("{stem}.{index}.{ext}"),
            None => format!("{stem}.{index}"),
        };
        let candidate = parent.join(file_name);
        if !candidate.exists() {
            return candidate;
        }
    }
    path
}

pub fn load_routing(paths: &CodexPaths) -> Result<PilotRoutingPayload, String> {
    load_routing_payload(paths).map_err(|e| e.to_string())
}

pub fn load_relay_state(paths: &CodexPaths) -> Result<RelayStatePayload, CoreError> {
    let state = load_relay_state_file(paths)?;
    Ok(relay_state_payload(paths, state))
}

pub fn upsert_relay_provider(
    paths: &CodexPaths,
    input: RelayUpsertInput,
) -> Result<RelayMutationPayload, CoreError> {
    validate_relay_input(&input)?;
    let mut state = load_relay_state_file(paths)?;
    let now = current_timestamp();
    let provider_id = sanitize_provider_id(&input.id);
    let existing_provider = state
        .providers
        .iter()
        .find(|existing| existing.id == provider_id)
        .cloned();
    let submitted_api_key = input
        .api_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let preserved_api_key = submitted_api_key
        .clone()
        .or_else(|| existing_provider.as_ref().and_then(|provider| provider.api_key.clone()));
    let api_key_stored = submitted_api_key.is_some()
        || existing_provider
            .as_ref()
            .map(|provider| provider.api_key_stored)
            .unwrap_or(false);
    let previous_models = existing_provider
        .as_ref()
        .map(|provider| provider.models.clone())
        .unwrap_or_default();
    let provider = RelayProvider {
        id: provider_id,
        name: input.name.trim().to_string(),
        ide: normalize_relay_ide(&input.ide),
        base_url: trim_trailing_slash(input.base_url.trim()),
        api_key_stored,
        api_key: preserved_api_key,
        model: input.model.trim().to_string(),
        wire_api: normalize_wire_api(&input.wire_api),
        extra_headers: input.extra_headers,
        network: normalize_relay_network(&input.network),
        enabled: true,
        health_score: None,
        latency_ms: None,
        last_tested_at: None,
        created_at: now,
        updated_at: now,
        last_error: None,
        error_message: None,
        models: previous_models,
    };
    if let Some(existing) = state
        .providers
        .iter_mut()
        .find(|existing| existing.id == provider.id)
    {
        let created_at = existing.created_at;
        *existing = RelayProvider {
            created_at,
            ..provider.clone()
        };
    } else {
        state.providers.push(provider.clone());
    }
    state
        .active_by_ide
        .entry(provider.ide.clone())
        .or_insert_with(|| provider.id.clone());
    if let Some(api_key) = submitted_api_key.as_deref() {
        persist_relay_env_key(&provider.id, api_key)?;
    }
    save_relay_state_file(paths, &state)?;
    sync_codex_router_config(paths, &state)?;
    Ok(RelayMutationPayload {
        state: relay_state_payload(paths, state),
        provider: Some(provider),
    })
}

pub fn delete_relay_provider(
    paths: &CodexPaths,
    provider_id: &str,
) -> Result<RelayMutationPayload, CoreError> {
    let mut state = load_relay_state_file(paths)?;
    let before = state.providers.len();
    state.providers.retain(|p| p.id != provider_id);
    if before == state.providers.len() {
        return Err(CoreError::NotFound(format!(
            "Relay provider not found: {provider_id}"
        )));
    }
    for active in state.active_by_ide.values_mut() {
        if active == provider_id {
            *active = state
                .providers
                .iter()
                .find(|p| p.enabled && p.ide == "codex")
                .map(|p| p.id.clone())
                .unwrap_or_default();
        }
    }
    state.active_by_ide.retain(|_, value| !value.is_empty());
    unset_relay_env_key(provider_id);
    save_relay_state_file(paths, &state)?;
    sync_codex_router_config(paths, &state)?;
    Ok(RelayMutationPayload {
        state: relay_state_payload(paths, state),
        provider: None,
    })
}

pub fn activate_relay_provider(
    paths: &CodexPaths,
    provider_id: &str,
) -> Result<RelayMutationPayload, CoreError> {
    let mut state = load_relay_state_file(paths)?;
    let mut provider = None;
    for existing in &mut state.providers {
        if existing.id == provider_id {
            existing.enabled = true;
            existing.updated_at = current_timestamp();
            provider = Some(existing.clone());
            break;
        }
    }
    let provider =
        provider.ok_or_else(|| CoreError::NotFound(format!("Relay provider not found: {provider_id}")))?;
    state.active_by_ide.insert(provider.ide.clone(), provider.id.clone());
    save_relay_state_file(paths, &state)?;
    sync_codex_router_config(paths, &state)?;
    Ok(RelayMutationPayload {
        state: relay_state_payload(paths, state),
        provider: Some(provider),
    })
}

pub fn deactivate_relay_provider(
    paths: &CodexPaths,
    provider_id: &str,
) -> Result<RelayMutationPayload, CoreError> {
    let mut state = load_relay_state_file(paths)?;
    for provider in &mut state.providers {
        if provider.id == provider_id {
            provider.enabled = false;
            provider.updated_at = current_timestamp();
        }
    }
    state
        .active_by_ide
        .retain(|_, active_provider_id| active_provider_id != provider_id);
    save_relay_state_file(paths, &state)?;
    sync_codex_router_config(paths, &state)?;
    Ok(RelayMutationPayload {
        state: relay_state_payload(paths, state),
        provider: None,
    })
}

pub fn set_relay_provider_network(
    paths: &CodexPaths,
    provider_id: &str,
    network: &str,
) -> Result<RelayMutationPayload, CoreError> {
    let mut state = load_relay_state_file(paths)?;
    let mut updated = None;
    for provider in &mut state.providers {
        if provider.id == provider_id {
            provider.network = normalize_relay_network(network);
            provider.updated_at = current_timestamp();
            updated = Some(provider.clone());
        }
    }
    save_relay_state_file(paths, &state)?;
    Ok(RelayMutationPayload {
        state: relay_state_payload(paths, state),
        provider: updated,
    })
}

pub fn set_codex_router_enabled(
    paths: &CodexPaths,
    enabled: bool,
) -> Result<RelayStatePayload, CoreError> {
    let mut state = load_relay_state_file(paths)?;
    state.codex_router_enabled = enabled;
    save_relay_state_file(paths, &state)?;
    sync_codex_router_config(paths, &state)?;
    Ok(relay_state_payload(paths, state))
}

pub fn test_relay_provider(
    paths: &CodexPaths,
    provider_id: &str,
) -> Result<RelayTestPayload, CoreError> {
    let mut state = load_relay_state_file(paths)?;
    let provider = state
        .providers
        .iter()
        .find(|p| p.id == provider_id)
        .cloned()
        .ok_or_else(|| CoreError::NotFound(format!("Relay provider not found: {provider_id}")))?;
    let started = std::time::Instant::now();
    let result = test_provider_connectivity(&provider);
    let latency_ms = started.elapsed().as_millis() as i64;
    for existing in &mut state.providers {
        if existing.id == provider_id {
            existing.last_tested_at = Some(current_timestamp());
            existing.latency_ms = Some(latency_ms);
            existing.health_score = Some(if result.reachable { 100 } else { 0 });
            existing.last_error = if result.reachable {
                None
            } else {
                Some("network_error".to_string())
            };
            existing.error_message = if result.reachable {
                None
            } else {
                Some(result.message.clone())
            };
        }
    }
    save_relay_state_file(paths, &state)?;
    Ok(RelayTestPayload {
        latency_ms: Some(latency_ms),
        ..result
    })
}

pub fn get_relay_proxy_status(paths: &CodexPaths) -> Result<RelayProxyState, CoreError> {
    Ok(load_relay_state_file(paths)?.proxy)
}

pub fn diagnose_codex_router(paths: &CodexPaths) -> Result<RelayRouteDiagnosticPayload, CoreError> {
    let state = load_relay_state_file(paths)?;
    Ok(diagnose_codex_router_state(paths, &state))
}

pub fn run_codex_router_diagnostics(
    paths: &CodexPaths,
) -> Result<RelayRouteDiagnosticPayload, CoreError> {
    diagnose_codex_router(paths)
}

pub fn fix_codex_router_issue(paths: &CodexPaths) -> Result<RelayRouteDiagnosticPayload, CoreError> {
    let state = load_relay_state_file(paths)?;
    sync_codex_router_config(paths, &state)?;
    diagnose_codex_router(paths)
}

pub fn export_relay_config(paths: &CodexPaths) -> Result<RelayExportPayload, CoreError> {
    paths.ensure_directories()?;
    let state = load_relay_state_file(paths)?;
    let export_path = paths.codexmate_dir.join("PPToken-relay.json");
    let export = RelayExportFile {
        schema_version: RELAY_STATE_SCHEMA_VERSION,
        kind: "pptoken-relay".to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        exported_at: current_timestamp(),
        exported_by: "PPToken".to_string(),
        include_api_keys: true,
        codex_router_enabled: state.codex_router_enabled,
        active_by_ide: state.active_by_ide.clone(),
        proxy: state.proxy.clone(),
        providers: state.providers.clone(),
    };
    fs::write(&export_path, serde_json::to_string_pretty(&export)?)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&export_path, fs::Permissions::from_mode(0o600));
    }
    Ok(RelayExportPayload {
        file_path: export_path.display().to_string(),
        provider_count: export.providers.len() as i32,
    })
}

pub fn import_relay_config(
    paths: &CodexPaths,
    file_path: &str,
) -> Result<RelayImportPayload, CoreError> {
    let raw = fs::read_to_string(file_path)?;
    let import: RelayImportFile = serde_json::from_str(&raw)?;
    if let Some(kind) = import.kind.as_deref() {
        if !kind.contains("relay") {
            return Err(CoreError::InvalidData(
            "Not a valid PPToken relay export".into(),
            ));
        }
    }
    let mut state = load_relay_state_file(paths)?;
    let mut imported = 0_i32;
    let mut skipped = Vec::new();

    if let Some(router_enabled) = import.codex_router_enabled {
        state.codex_router_enabled = router_enabled;
    }
    if let Some(active_by_ide) = import.active_by_ide {
        state.active_by_ide = active_by_ide;
    }
    if let Some(proxy) = import.proxy {
        state.proxy = proxy;
    }

    for provider in import.providers {
        let sanitized = sanitize_provider_id(&provider.id);
        if sanitized.is_empty() {
            skipped.push(provider.id);
            continue;
        }
        let api_key = provider.api_key.filter(|value| !value.trim().is_empty());
        let api_key_stored = provider.api_key_stored || api_key.is_some();
        let provider = RelayProvider {
            id: sanitized,
            name: provider.name.trim().to_string(),
            ide: normalize_relay_ide(&provider.ide),
            base_url: trim_trailing_slash(provider.base_url.trim()),
            api_key,
            api_key_stored,
            model: provider.model.trim().to_string(),
            wire_api: normalize_wire_api(&provider.wire_api),
            extra_headers: provider.extra_headers,
            network: normalize_relay_network(&provider.network),
            enabled: provider.enabled,
            health_score: provider.health_score,
            latency_ms: provider.latency_ms,
            last_tested_at: provider.last_tested_at,
            created_at: provider.created_at,
            updated_at: provider.updated_at,
            last_error: provider.last_error,
            error_message: provider.error_message,
            models: provider.models,
        };
        if let Some(existing) = state.providers.iter_mut().find(|existing| existing.id == provider.id) {
            *existing = provider.clone();
        } else {
            state.providers.push(provider.clone());
        }
        if let Some(api_key) = provider.api_key.as_deref() {
            persist_relay_env_key(&provider.id, api_key)?;
        }
        imported += 1;
    }

    save_relay_state_file(paths, &state)?;
    sync_codex_router_config(paths, &state)?;
    Ok(RelayImportPayload {
        imported_count: imported,
        skipped,
        state: relay_state_payload(paths, state),
    })
}

pub fn fetch_relay_models_draft(
    paths: &CodexPaths,
    provider_id: &str,
) -> Result<RelayModelFetchPayload, CoreError> {
    let mut state = load_relay_state_file(paths)?;
    let provider = state
        .providers
        .iter()
        .find(|p| p.id == provider_id)
        .cloned()
        .ok_or_else(|| CoreError::NotFound(format!("Relay provider not found: {provider_id}")))?;
    let base = provider.base_url.trim_end_matches('/');
    let endpoint = if provider.wire_api == "anthropic" {
        format!("{base}/v1/models")
    } else {
        format!("{base}/v1/models")
    };
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()?;
    let mut request = client.get(&endpoint);
    if let Some(key) = provider.api_key.as_deref().filter(|value| !value.trim().is_empty()) {
        request = request.bearer_auth(key.trim());
    }
    for (key, value) in &provider.extra_headers {
        request = request.header(key, value);
    }
    let response = request.send();
    let mut models = Vec::new();
    let (status_code, message) = match response {
        Ok(response) => {
            let status = Some(response.status().as_u16() as i32);
            let text = response.text().unwrap_or_default();
            if let Ok(parsed) = serde_json::from_str::<Value>(&text) {
                models = extract_models_from_response(&parsed);
            }
            (
                status,
                if models.is_empty() {
                    format!("HTTP {} from {}", status.unwrap_or_default(), endpoint)
                } else {
                    format!("Fetched {} models from {}", models.len(), endpoint)
                },
            )
        }
        Err(error) => (None, error.to_string()),
    };

    for existing in &mut state.providers {
        if existing.id == provider.id {
            existing.models = models.clone();
            existing.last_tested_at = Some(current_timestamp());
            existing.updated_at = current_timestamp();
            if status_code.map(|code| code >= 200 && code < 300).unwrap_or(false) {
                existing.health_score = Some(100);
                existing.last_error = None;
                existing.error_message = None;
            } else if status_code.is_some() {
                existing.health_score = Some(0);
                existing.last_error = Some("model_fetch_failed".to_string());
                existing.error_message = Some(message.clone());
            }
        }
    }
    save_relay_state_file(paths, &state)?;
    Ok(RelayModelFetchPayload {
        provider_id: provider.id,
        models,
        endpoint,
        status_code,
        message,
    })
}

fn diagnose_codex_router_state(
    paths: &CodexPaths,
    state: &RelayStateFile,
) -> RelayRouteDiagnosticPayload {
    let active_provider = state.active_by_ide.get("codex").cloned();
    let active_model = active_provider
        .as_deref()
        .and_then(|id| state.providers.iter().find(|provider| provider.id == id))
        .map(|provider| provider.model.clone());
    let config = fs::read_to_string(&paths.config_path).unwrap_or_default();
    let catalog_path = relay_catalog_path(paths);
    let config_has_router = config.contains(RELAY_TOP_BEGIN)
        || config.contains(RELAY_MANAGED_BEGIN)
        || config.contains(RELAY_CODEX_PROVIDER)
        || config.contains(RELAY_PROFILE);
    let catalog_exists = catalog_path.exists();
    let mut issues = Vec::new();
    let mut suggestions = Vec::new();

    if state.codex_router_enabled && state.providers.is_empty() {
        issues.push("NO_RELAY_PROVIDER".to_string());
        suggestions.push("Add at least one Codex relay provider.".to_string());
    }
    if state.codex_router_enabled && active_provider.is_none() {
        issues.push("NO_ACTIVE_PROVIDER".to_string());
        suggestions.push("Activate a provider for Codex.".to_string());
    }
    if state.codex_router_enabled && !config_has_router {
        issues.push("CONFIG_MISSING_ROUTER".to_string());
        suggestions.push("Run repair to rewrite the managed Codex router block.".to_string());
    }
    if state.codex_router_enabled && !catalog_exists {
        issues.push("CATALOG_MISSING".to_string());
        suggestions.push("Run repair to rebuild codex_router_catalog.json.".to_string());
    }
    if let Some(active_provider) = active_provider.as_deref() {
        if let Some(provider) = state.providers.iter().find(|provider| provider.id == active_provider)
        {
            if provider.api_key.as_deref().unwrap_or_default().trim().is_empty()
                && !provider.api_key_stored
            {
                issues.push("ACTIVE_PROVIDER_MISSING_KEY".to_string());
                suggestions.push("Edit the active provider and save its API key.".to_string());
            }
        } else {
            issues.push("ACTIVE_PROVIDER_NOT_FOUND".to_string());
            suggestions.push("Activate an existing provider or repair the relay state.".to_string());
        }
    }
    if issues.is_empty() {
        suggestions.push("Codex router managed files look consistent.".to_string());
    }

    RelayRouteDiagnosticPayload {
        router_enabled: state.codex_router_enabled,
        proxy_running: state.proxy.running,
        proxy_port: state.proxy.port,
        active_provider,
        active_model,
        provider_count: state.providers.len() as i32,
        catalog_exists,
        config_has_router,
        state_path: relay_state_path(paths).display().to_string(),
        config_path: paths.config_path.display().to_string(),
        catalog_path: catalog_path.display().to_string(),
        issues,
        suggestions,
    }
}

fn load_routing_payload(paths: &CodexPaths) -> Result<PilotRoutingPayload, CoreError> {
    let raw = fs::read_to_string(&paths.config_path).unwrap_or_default();
    let value: toml::Value = if raw.trim().is_empty() {
        toml::Value::Table(Default::default())
    } else {
        toml::from_str(&raw)?
    };
    let state = load_relay_state_file(paths)?;
    let config_active_provider = value
        .get("model_provider")
        .and_then(|v| v.as_str())
        .map(ToOwned::to_owned)
        .or_else(|| {
            value
                .get("profile")
                .and_then(|v| v.as_str())
                .map(ToOwned::to_owned)
        });
    let active_model = value
        .get("model")
        .and_then(|v| v.as_str())
        .map(ToOwned::to_owned);
    let profile_name = value
        .get("profile")
        .and_then(|v| v.as_str())
        .map(ToOwned::to_owned);

    let mut providers = config_providers_from_toml(&value);
    for provider in &state.providers {
        providers.push(relay_provider_summary(provider, &state));
    }
    providers.sort_by(|a, b| a.id.cmp(&b.id));
    providers.dedup_by(|a, b| a.id == b.id);

    let codex_active = state
        .active_by_ide
        .get("codex")
        .and_then(|id| state.providers.iter().find(|p| &p.id == id));
    let active_provider = if state.codex_router_enabled {
        codex_active
            .map(|provider| provider.id.clone())
            .or(config_active_provider)
    } else {
        config_active_provider
    };
    let status_message = if state.codex_router_enabled {
        codex_active
            .map(|p| format!("Codex router enabled via {}", p.name))
            .or_else(|| Some("Codex router enabled but no active relay provider".to_string()))
    } else {
        Some("Codex router disabled".to_string())
    };

    Ok(PilotRoutingPayload {
        codex_router_enabled: state.codex_router_enabled,
        active_provider,
        active_model,
        profile_name,
        proxy_running: state.proxy.running,
        proxy_port: state.proxy.port,
        status_message,
        providers,
        source_path: paths.config_path.display().to_string(),
        last_scan_at: current_timestamp(),
    })
}

fn read_json_if_exists(path: &Path) -> Option<Value> {
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
}

fn load_repository_registry(paths: &CodexPaths) -> crate::core::repository::RegistryFile {
    fs::read_to_string(&paths.registry_path)
        .ok()
        .and_then(|raw| serde_json::from_str::<crate::core::repository::RegistryFile>(&raw).ok())
        .unwrap_or_else(|| crate::core::repository::RegistryFile {
            schema_version: 2,
            updated_at: current_timestamp(),
            active_account_key: None,
            items: Vec::new(),
            auto_switch: Some(Default::default()),
            api: Some(Default::default()),
        })
}

fn save_repository_registry(
    paths: &CodexPaths,
    registry: &crate::core::repository::RegistryFile,
) -> Result<(), CoreError> {
    paths.ensure_directories()?;
    if paths.registry_path.exists() {
        let backup = paths
            .registry_backups_dir
            .join(format!("registry-{}.json", current_timestamp()));
        let _ = fs::copy(&paths.registry_path, backup);
    }
    fs::write(&paths.registry_path, serde_json::to_string_pretty(registry)?)?;
    Ok(())
}

fn account_snapshot_path(paths: &CodexPaths, account_key: &str) -> PathBuf {
    let safe_name = account_key
        .replace('@', "_")
        .replace('/', "_")
        .replace(':', "_");
    paths.snapshots_dir.join(format!("{safe_name}.json"))
}

fn backup_current_auth(paths: &CodexPaths) -> Result<(), CoreError> {
    paths.ensure_directories()?;
    if paths.auth_path.exists() {
        let backup = paths
            .auth_backups_dir
            .join(format!("auth-{}.json", current_timestamp()));
        fs::copy(&paths.auth_path, backup)?;
    }
    Ok(())
}

fn read_accounts_export(file_path: &str) -> Result<AccountsExportFile, CoreError> {
    let raw = fs::read_to_string(file_path)?;
    let export: AccountsExportFile = serde_json::from_str(&raw)?;
    if export.kind != ACCOUNTS_EXPORT_KIND {
        return Err(CoreError::InvalidData(
            "Not a valid PPToken accounts backup".into(),
        ));
    }
    Ok(export)
}

fn exported_account_summary(
    account: &ExportedAccount,
    active: bool,
    snapshot_path: String,
) -> PilotAccountSummary {
    PilotAccountSummary {
        account_key: account.account_key.clone(),
        email: account.email.clone(),
        alias: account.alias.clone(),
        account_name: account.account_name.clone(),
        workspace_name: account.workspace_name.clone(),
        profile_name: account.profile_name.clone(),
        plan: account.plan.clone(),
        auth_mode: account.auth_mode.clone(),
        active,
        snapshot_path,
        created_at: account.created_at,
        last_used_at: account.last_used_at,
        last_usage_at: None,
        has_api_key: json_has_key(&Some(account.snapshot.clone()), "OPENAI_API_KEY"),
        has_refresh_token: json_has_nested_key(&Some(account.snapshot.clone()), &["tokens", "refresh_token"])
            || json_has_key(&Some(account.snapshot.clone()), "refresh_token"),
        has_active_subscription: account.has_active_subscription,
        subscription_expires_at: account.subscription_expires_at,
        subscription_will_renew: account.subscription_will_renew,
        usage_source: None,
        primary_window: None,
        secondary_window: None,
        token_status: None,
        relay_provider_id: None,
        relay_provider_name: None,
        relay_provider_base_url: None,
    }
}

fn repository_item_from_export(
    account: &ExportedAccount,
    snapshot_path: &str,
    now: i64,
) -> crate::core::repository::RegistryItem {
    crate::core::repository::RegistryItem {
        account_key: account.account_key.clone(),
        snapshot_path: snapshot_path.to_string(),
        email: account.email.clone().unwrap_or_else(|| "Imported Account".into()),
        alias: account.alias.clone().unwrap_or_default(),
        account_name: account.account_name.clone(),
        workspace_name: account.workspace_name.clone(),
        profile_name: account.profile_name.clone(),
        plan: account.plan.clone().unwrap_or_else(|| "unknown".into()),
        auth_mode: account.auth_mode.clone().unwrap_or_else(|| "chatgpt".into()),
        has_active_subscription: account.has_active_subscription,
        subscription_expires_at: account.subscription_expires_at,
        subscription_will_renew: account.subscription_will_renew,
        created_at: account.created_at.unwrap_or(now),
        last_used_at: account.last_used_at,
        last_usage_at: None,
        cached_primary_window: None,
        cached_secondary_window: None,
    }
}

fn redact_auth_snapshot(value: &mut Value) {
    if let Some(obj) = value.as_object_mut() {
        obj.remove("OPENAI_API_KEY");
        obj.remove("openai_api_key");
        obj.remove("refresh_token");
        if let Some(tokens) = obj.get_mut("tokens").and_then(|v| v.as_object_mut()) {
            tokens.remove("access_token");
            tokens.remove("id_token");
            tokens.remove("refresh_token");
        }
    }
}

fn relay_state_path(paths: &CodexPaths) -> PathBuf {
    paths.codexmate_dir.join("relay-state.json")
}

fn relay_catalog_path(paths: &CodexPaths) -> PathBuf {
    paths.codexmate_dir.join("codex_router_catalog.json")
}

fn load_relay_state_file(paths: &CodexPaths) -> Result<RelayStateFile, CoreError> {
    let path = relay_state_path(paths);
    if !path.exists() {
        return Ok(RelayStateFile {
            schema_version: RELAY_STATE_SCHEMA_VERSION,
            codex_router_enabled: false,
            active_by_ide: HashMap::new(),
            providers: Vec::new(),
            proxy: RelayProxyState::default(),
        });
    }
    let mut state: RelayStateFile = serde_json::from_str(&fs::read_to_string(path)?)?;
    state.schema_version = RELAY_STATE_SCHEMA_VERSION;
    normalize_relay_state(&mut state);
    Ok(state)
}

fn save_relay_state_file(paths: &CodexPaths, state: &RelayStateFile) -> Result<(), CoreError> {
    paths.ensure_directories()?;
    let path = relay_state_path(paths);
    let mut normalized = state.clone();
    normalized.schema_version = RELAY_STATE_SCHEMA_VERSION;
    normalize_relay_state(&mut normalized);
    sync_relay_env_keys(&normalized)?;
    fs::write(&path, serde_json::to_string_pretty(&normalized)?)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

fn sync_relay_env_keys(state: &RelayStateFile) -> Result<(), CoreError> {
    for provider in &state.providers {
        if let Some(api_key) = provider
            .api_key
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            persist_relay_env_key(&provider.id, api_key)?;
        }
    }
    Ok(())
}

fn relay_state_payload(paths: &CodexPaths, state: RelayStateFile) -> RelayStatePayload {
    RelayStatePayload {
        codex_router_enabled: state.codex_router_enabled,
        active_by_ide: state.active_by_ide,
        proxy: state.proxy,
        providers: state.providers,
        state_path: relay_state_path(paths).display().to_string(),
        config_path: paths.config_path.display().to_string(),
        last_scan_at: current_timestamp(),
    }
}

fn config_providers_from_toml(value: &toml::Value) -> Vec<PilotModelProviderSummary> {
    value
        .get("model_providers")
        .and_then(|v| v.as_table())
        .map(|table| {
            table
                .iter()
                .map(|(id, provider)| {
                    let provider = provider.as_table();
                    let api_key_env = provider
                        .and_then(|p| p.get("api_key_env"))
                        .and_then(|v| v.as_str())
                        .map(ToOwned::to_owned);
                    PilotModelProviderSummary {
                        id: id.clone(),
                        name: provider
                            .and_then(|p| p.get("name"))
                            .and_then(|v| v.as_str())
                            .map(ToOwned::to_owned),
                        base_url: provider
                            .and_then(|p| p.get("base_url"))
                            .and_then(|v| v.as_str())
                            .map(ToOwned::to_owned),
                        wire_api: provider
                            .and_then(|p| p.get("wire_api"))
                            .and_then(|v| v.as_str())
                            .map(ToOwned::to_owned),
                        model: provider
                            .and_then(|p| p.get("model"))
                            .and_then(|v| v.as_str())
                            .map(ToOwned::to_owned),
                        requires_openai_auth: provider
                            .and_then(|p| p.get("requires_openai_auth"))
                            .and_then(|v| v.as_bool()),
                        has_api_key_env_config: api_key_env.is_some(),
                        api_key_env,
                        api_key_stored: false,
                        network: None,
                        enabled: true,
                        health_score: None,
                        latency_ms: None,
                        last_tested_at: None,
                        updated_at: None,
                        last_error: None,
                        error_message: None,
                        models: Vec::new(),
                        extra_headers: HashMap::new(),
                    }
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn relay_provider_summary(
    provider: &RelayProvider,
    _state: &RelayStateFile,
) -> PilotModelProviderSummary {
    PilotModelProviderSummary {
        id: provider.id.clone(),
        name: Some(provider.name.clone()),
        base_url: Some(provider.base_url.clone()),
        wire_api: Some(provider.wire_api.clone()),
        model: Some(provider.model.clone()),
        api_key_env: None,
        api_key_stored: provider.api_key_stored || provider.api_key.is_some(),
        requires_openai_auth: Some(false),
        has_api_key_env_config: provider.api_key_stored || provider.api_key.is_some(),
        network: Some(provider.network.clone()),
        enabled: provider.enabled,
        health_score: provider.health_score,
        latency_ms: provider.latency_ms,
        last_tested_at: provider.last_tested_at,
        updated_at: Some(provider.updated_at),
        last_error: provider.last_error.clone(),
        error_message: provider.error_message.clone(),
        models: provider.models.clone(),
        extra_headers: provider.extra_headers.clone(),
    }
}

fn validate_relay_input(input: &RelayUpsertInput) -> Result<(), CoreError> {
    if sanitize_provider_id(&input.id).is_empty() {
        return Err(CoreError::InvalidData("Provider id is required".into()));
    }
    if input.name.trim().is_empty() {
        return Err(CoreError::InvalidData("Provider name is required".into()));
    }
    if input.base_url.trim().is_empty() {
        return Err(CoreError::InvalidData("Base URL is required".into()));
    }
    if input.model.trim().is_empty() {
        return Err(CoreError::InvalidData("Model is required".into()));
    }
    Ok(())
}

fn sanitize_provider_id(id: &str) -> String {
    id.trim()
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' {
                ch.to_ascii_lowercase()
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim_matches('_')
        .to_string()
}

fn normalize_relay_ide(value: &str) -> String {
    match value.trim().to_ascii_lowercase().as_str() {
        "" => "codex".into(),
        other => other.to_string(),
    }
}

fn normalize_wire_api(value: &str) -> String {
    match value.trim().to_ascii_lowercase().as_str() {
        "anthropic" | "claude" => "anthropic".into(),
        "openai-chat" | "chat" | "chat-completions" | "openai-responses" | "responses" => {
            RELAY_OPENAI_WIRE_API.into()
        }
        _ => RELAY_OPENAI_WIRE_API.into(),
    }
}

fn normalize_relay_state(state: &mut RelayStateFile) {
    for provider in &mut state.providers {
        provider.ide = normalize_relay_ide(&provider.ide);
        provider.network = normalize_relay_network(&provider.network);
        provider.wire_api = normalize_wire_api(&provider.wire_api);
        provider.base_url = trim_trailing_slash(provider.base_url.trim());
        provider.model = provider.model.trim().to_string();
    }
}

fn normalize_relay_network(value: &str) -> String {
    match value.trim().to_ascii_lowercase().as_str() {
        "system" => "system".into(),
        _ => "direct".into(),
    }
}

fn trim_trailing_slash(value: &str) -> String {
    value.trim_end_matches('/').to_string()
}

fn test_provider_connectivity(provider: &RelayProvider) -> RelayTestPayload {
    let base = provider.base_url.trim_end_matches('/');
    let endpoint = if provider.wire_api == "anthropic" {
        format!("{base}/v1/messages")
    } else {
        format!("{base}/v1/models")
    };
    let client = match reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
    {
        Ok(client) => client,
        Err(error) => {
            return RelayTestPayload {
                provider_id: provider.id.clone(),
                reachable: false,
                status_code: None,
                latency_ms: None,
                message: format!("client build failed: {error}"),
            }
        }
    };
    let mut req = client.get(&endpoint);
    if let Some(key) = &provider.api_key {
        if !key.trim().is_empty() {
            req = req.bearer_auth(key.trim());
        }
    }
    for (key, value) in &provider.extra_headers {
        req = req.header(key, value);
    }
    match req.send() {
        Ok(response) => {
            let status = response.status().as_u16() as i32;
            RelayTestPayload {
                provider_id: provider.id.clone(),
                reachable: response.status().is_success() || status == 401 || status == 403,
                status_code: Some(status),
                latency_ms: None,
                message: format!("HTTP {status} from {endpoint}"),
            }
        }
        Err(error) => RelayTestPayload {
            provider_id: provider.id.clone(),
            reachable: false,
            status_code: None,
            latency_ms: None,
            message: error.to_string(),
        },
    }
}

fn extract_models_from_response(value: &Value) -> Vec<String> {
    let mut models = Vec::new();
    if let Some(data) = value.get("data").and_then(|data| data.as_array()) {
        for item in data {
            if let Some(id) = item.get("id").and_then(|id| id.as_str()) {
                models.push(id.to_string());
            }
        }
    }
    if models.is_empty() {
        if let Some(data) = value.get("models").and_then(|data| data.as_array()) {
            for item in data {
                if let Some(id) = item.as_str() {
                    models.push(id.to_string());
                } else if let Some(id) = item.get("id").and_then(|id| id.as_str()) {
                    models.push(id.to_string());
                }
            }
        }
    }
    models.sort();
    models.dedup();
    models
}

fn sync_codex_router_config(paths: &CodexPaths, state: &RelayStateFile) -> Result<(), CoreError> {
    let original = fs::read_to_string(&paths.config_path).unwrap_or_default();
    let without_managed = remove_managed_blocks(&original);
    let mut next = without_managed.trim_end().to_string();
    if state.codex_router_enabled {
        let active = state
            .active_by_ide
            .get("codex")
            .and_then(|id| state.providers.iter().find(|p| &p.id == id))
            .or_else(|| state.providers.iter().find(|p| p.enabled && p.ide == "codex"));
        if let Some(provider) = active {
            let top_block = render_router_top_block(paths);
            let provider_block = render_router_provider_block(provider);
            if !next.is_empty() {
                next.push_str("\n\n");
            }
            next.push_str(&top_block);
            next.push_str("\n\n");
            next.push_str(&provider_block);
        }
        write_relay_catalog(paths, state)?;
    } else {
        let _ = fs::remove_file(relay_catalog_path(paths));
    }
    if !next.ends_with('\n') {
        next.push('\n');
    }
    if let Some(parent) = paths.config_path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&paths.config_path, next)?;
    Ok(())
}

fn render_router_top_block(paths: &CodexPaths) -> String {
    format!(
        "{RELAY_TOP_BEGIN}\nprofile = \"{RELAY_PROFILE}\"\nmodel_catalog_json = \"{}\"\n{RELAY_TOP_END}",
        relay_catalog_path(paths).display()
    )
}

fn render_router_provider_block(provider: &RelayProvider) -> String {
    let provider_name = toml_string(&format!("PPToken {}", provider.name));
    let base_url = toml_string(&provider.base_url);
    let model = toml_string(&provider.model);
    let wire_api = toml_string(&normalize_wire_api(&provider.wire_api));
    let env_key = toml_string(&relay_env_key(&provider.id));
    format!(
        "{RELAY_MANAGED_BEGIN}\n[model_providers.{RELAY_CODEX_PROVIDER}]\nname = {provider_name}\nbase_url = {base_url}\nenv_key = {env_key}\napi_key_env = {env_key}\nwire_api = {wire_api}\nrequires_openai_auth = false\nrequest_max_retries = 4\nstream_max_retries = 10\nstream_idle_timeout_ms = 300000\n\n[profiles.{RELAY_PROFILE}]\nmodel_provider = \"{RELAY_CODEX_PROVIDER}\"\nmodel = {model}\n{RELAY_MANAGED_END}"
    )
}

fn remove_managed_blocks(text: &str) -> String {
    let mut out = Vec::new();
    let mut inside = false;
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed == RELAY_TOP_BEGIN || trimmed == RELAY_MANAGED_BEGIN {
            inside = true;
            continue;
        }
        if trimmed == RELAY_TOP_END || trimmed == RELAY_MANAGED_END {
            inside = false;
            continue;
        }
        if !inside {
            out.push(line.to_string());
        }
    }
    out.join("\n")
}

fn write_relay_catalog(paths: &CodexPaths, state: &RelayStateFile) -> Result<(), CoreError> {
    paths.ensure_directories()?;
    let providers = state
        .providers
        .iter()
        .filter(|p| p.enabled && p.ide == "codex")
        .map(|provider| {
            serde_json::json!({
                "id": provider.id,
                "name": provider.name,
                "model": provider.model,
                "wireApi": normalize_wire_api(&provider.wire_api),
                "baseUrl": provider.base_url,
            })
        })
        .collect::<Vec<_>>();
    let catalog = serde_json::json!({
        "generatedBy": "PPToken",
        "generatedAt": current_timestamp(),
        "profile": RELAY_PROFILE,
        "modelProvider": RELAY_CODEX_PROVIDER,
        "providers": providers,
    });
    fs::write(
        relay_catalog_path(paths),
        serde_json::to_string_pretty(&catalog)?,
    )?;
    Ok(())
}

fn toml_string(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}

fn relay_env_key(provider_id: &str) -> String {
    let suffix = sanitize_provider_id(provider_id)
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_uppercase()
            } else {
                '_'
            }
        })
        .collect::<String>();
    format!("PPTOKEN_RELAY_{suffix}_API_KEY")
}

fn persist_relay_env_key(provider_id: &str, api_key: &str) -> Result<(), CoreError> {
    let env_key = relay_env_key(provider_id);
    std::env::set_var(&env_key, api_key);
    #[cfg(target_os = "macos")]
    {
        let output = std::process::Command::new("launchctl")
            .args(["setenv", &env_key, api_key])
            .output()
            .map_err(|e| CoreError::OperationFailed(format!("launchctl setenv failed: {e}")))?;
        if !output.status.success() {
            return Err(CoreError::OperationFailed(format!(
                "launchctl setenv failed: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            )));
        }
    }
    Ok(())
}

fn unset_relay_env_key(provider_id: &str) {
    let env_key = relay_env_key(provider_id);
    std::env::remove_var(&env_key);
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("launchctl")
            .args(["unsetenv", &env_key])
            .output();
    }
}

fn relay_provider_for_snapshot<'a>(
    snapshot: Option<&Value>,
    relay_state: Option<&'a RelayStateFile>,
) -> Option<&'a RelayProvider> {
    let api_key = snapshot
        .and_then(|value| {
            value
                .get("OPENAI_API_KEY")
                .or_else(|| value.get("openai_api_key"))
        })
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())?;
    relay_state.and_then(|state| {
        state.providers.iter().find(|provider| {
            provider
                .api_key
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                == Some(api_key)
        })
    })
}

fn json_has_key(value: &Option<Value>, key: &str) -> bool {
    value
        .as_ref()
        .and_then(|v| v.get(key))
        .and_then(|v| v.as_str())
        .map(|s| !s.is_empty())
        .unwrap_or(false)
}

fn json_has_nested_key(value: &Option<Value>, path: &[&str]) -> bool {
    let mut current = value.as_ref();
    for key in path {
        current = current.and_then(|v| v.get(key));
    }
    current
        .and_then(|v| v.as_str())
        .map(|s| !s.is_empty())
        .unwrap_or(false)
}

fn collect_jsonl_files(dir: &Path, out: &mut Vec<PathBuf>) -> Result<(), String> {
    if !dir.exists() {
        return Ok(());
    }
    let entries = fs::read_dir(dir).map_err(|e| format!("read sessions dir failed: {e}"))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_jsonl_files(&path, out)?;
        } else if path.extension().and_then(|ext| ext.to_str()) == Some("jsonl") {
            out.push(path);
        }
    }
    Ok(())
}

fn load_indexed_threads(paths: &CodexPaths) -> Result<Vec<PilotSessionSummary>, CoreError> {
    let Some(connection) = open_codex_state_db_readonly(paths)? else {
        return Err(CoreError::NotFound(format!(
            "Codex state database not found: {}",
            paths.codex_state_db_path.display()
        )));
    };
    let mut statement = connection
        .prepare(
            r#"
            SELECT id, rollout_path, created_at, updated_at, source, model_provider, cwd, title,
                   tokens_used, archived, archived_at, git_branch, git_origin_url, cli_version,
                   first_user_message, agent_nickname, agent_role, model, reasoning_effort,
                   thread_source, preview
            FROM threads
            ORDER BY archived ASC, COALESCE(updated_at_ms, updated_at * 1000) DESC, id DESC
            LIMIT 1000
            "#,
        )
        .map_err(|e| CoreError::OperationFailed(format!("read Codex threads failed: {e}")))?;
    let rows = statement
        .query_map([], |row| {
            Ok(IndexedThreadRow {
                id: row.get(0)?,
                rollout_path: row.get(1)?,
                created_at: row.get(2)?,
                updated_at: row.get(3)?,
                source: row.get(4)?,
                model_provider: row.get(5)?,
                cwd: row.get(6)?,
                title: row.get(7)?,
                tokens_used: row.get(8)?,
                archived: row.get::<_, i64>(9)? != 0,
                archived_at: row.get(10)?,
                git_branch: row.get(11)?,
                git_origin_url: row.get(12)?,
                cli_version: row.get(13)?,
                first_user_message: row.get(14)?,
                agent_nickname: row.get(15)?,
                agent_role: row.get(16)?,
                model: row.get(17)?,
                reasoning_effort: row.get(18)?,
                thread_source: row.get(19)?,
                preview: row.get(20)?,
            })
        })
        .map_err(|e| CoreError::OperationFailed(format!("read Codex threads failed: {e}")))?;

    let mut items = Vec::new();
    for row in rows.filter_map(Result::ok) {
        items.push(row.into_summary());
    }
    Ok(items)
}

#[derive(Debug)]
struct IndexedThreadRow {
    id: String,
    rollout_path: String,
    created_at: i64,
    updated_at: i64,
    source: String,
    model_provider: String,
    cwd: String,
    title: String,
    tokens_used: i64,
    archived: bool,
    archived_at: Option<i64>,
    git_branch: Option<String>,
    git_origin_url: Option<String>,
    cli_version: String,
    first_user_message: String,
    agent_nickname: Option<String>,
    agent_role: Option<String>,
    model: Option<String>,
    reasoning_effort: Option<String>,
    thread_source: Option<String>,
    preview: String,
}

impl IndexedThreadRow {
    fn into_summary(self) -> PilotSessionSummary {
        let path = PathBuf::from(&self.rollout_path);
        let file_summary = summarize_session_file(&path);
        let metadata = fs::metadata(&path).ok();
        let file_exists = metadata.is_some();
        let title = non_empty_string(self.title)
            .or_else(|| non_empty_string(self.first_user_message.clone()))
            .or_else(|| file_summary.as_ref().map(|summary| summary.id.clone()));
        let preview = non_empty_string(self.preview).or_else(|| non_empty_string(self.first_user_message));

        PilotSessionSummary {
            id: self.id,
            path: self.rollout_path,
            title,
            preview,
            source: non_empty_string(self.source),
            cwd: non_empty_string(self.cwd).or_else(|| file_summary.as_ref().and_then(|summary| summary.cwd.clone())),
            originator: file_summary.as_ref().and_then(|summary| summary.originator.clone()),
            model_provider: non_empty_string(self.model_provider)
                .or_else(|| file_summary.as_ref().and_then(|summary| summary.model_provider.clone())),
            model: self.model,
            reasoning_effort: self.reasoning_effort,
            cli_version: non_empty_string(self.cli_version)
                .or_else(|| file_summary.as_ref().and_then(|summary| summary.cli_version.clone())),
            created_at: Some(epoch_to_iso(self.created_at)),
            created_at_epoch: Some(self.created_at),
            updated_at: Some(self.updated_at),
            size_bytes: metadata
                .as_ref()
                .map(|meta| meta.len())
                .or_else(|| file_summary.as_ref().map(|summary| summary.size_bytes))
                .unwrap_or(0),
            turn_count: file_summary.as_ref().map(|summary| summary.turn_count).unwrap_or(0),
            message_count: file_summary.as_ref().map(|summary| summary.message_count).unwrap_or(0),
            event_count: file_summary.as_ref().map(|summary| summary.event_count).unwrap_or(0),
            tokens_used: self.tokens_used,
            archived: self.archived,
            archived_at: self.archived_at,
            indexed: true,
            file_exists,
            git_branch: self.git_branch,
            git_origin_url: self.git_origin_url,
            thread_source: self.thread_source,
            agent_role: self.agent_role,
            agent_nickname: self.agent_nickname,
        }
    }
}

fn summarize_session_file(path: &Path) -> Option<PilotSessionSummary> {
    let meta = fs::metadata(path).ok()?;
    let updated_at = meta
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs() as i64);
    let file = fs::File::open(path).ok()?;
    let reader = BufReader::new(file);

    let mut id = path.file_stem()?.to_string_lossy().to_string();
    let mut cwd = None;
    let mut originator = None;
    let mut model_provider = None;
    let mut cli_version = None;
    let mut created_at = None;
    let mut turn_count = 0;
    let mut message_count = 0;
    let mut event_count = 0;

    for line in reader.lines().map_while(Result::ok) {
        let Ok(value) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        match value.get("type").and_then(|v| v.as_str()) {
            Some("session_meta") => {
                let Some(payload) = value.get("payload") else {
                    continue;
                };
                if let Some(next) = payload.get("id").and_then(|v| v.as_str()) {
                    id = next.to_string();
                }
                cwd = payload.get("cwd").and_then(|v| v.as_str()).map(ToOwned::to_owned);
                originator = payload
                    .get("originator")
                    .and_then(|v| v.as_str())
                    .map(ToOwned::to_owned);
                model_provider = payload
                    .get("model_provider")
                    .and_then(|v| v.as_str())
                    .map(ToOwned::to_owned);
                cli_version = payload
                    .get("cli_version")
                    .and_then(|v| v.as_str())
                    .map(ToOwned::to_owned);
                created_at = payload
                    .get("timestamp")
                    .and_then(|v| v.as_str())
                    .map(ToOwned::to_owned);
            }
            Some("turn_context") => turn_count += 1,
            Some("response_item") => message_count += 1,
            Some("event_msg") => event_count += 1,
            _ => {}
        }
    }

    Some(PilotSessionSummary {
        id,
        path: path.display().to_string(),
        title: None,
        preview: None,
        source: None,
        cwd,
        originator,
        model_provider,
        model: None,
        reasoning_effort: None,
        cli_version,
        created_at,
        created_at_epoch: None,
        updated_at,
        size_bytes: meta.len(),
        turn_count,
        message_count,
        event_count,
        tokens_used: 0,
        archived: false,
        archived_at: None,
        indexed: false,
        file_exists: true,
        git_branch: None,
        git_origin_url: None,
        thread_source: None,
        agent_role: None,
        agent_nickname: None,
    })
}

fn open_codex_state_db_readonly(paths: &CodexPaths) -> Result<Option<Connection>, CoreError> {
    if !paths.codex_state_db_path.exists() {
        return Ok(None);
    }
    Connection::open_with_flags(
        &paths.codex_state_db_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map(Some)
    .map_err(|e| CoreError::OperationFailed(format!("open Codex state database failed: {e}")))
}

fn open_codex_state_db_rw(paths: &CodexPaths) -> Result<Option<Connection>, CoreError> {
    if !paths.codex_state_db_path.exists() {
        return Ok(None);
    }
    Connection::open(&paths.codex_state_db_path)
        .map(Some)
        .map_err(|e| CoreError::OperationFailed(format!("open Codex state database failed: {e}")))
}

fn non_empty_string(value: String) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn epoch_to_iso(epoch_sec: i64) -> String {
    chrono::DateTime::<chrono::Utc>::from_timestamp(epoch_sec, 0)
        .map(|value| value.to_rfc3339())
        .unwrap_or_else(|| epoch_sec.to_string())
}
