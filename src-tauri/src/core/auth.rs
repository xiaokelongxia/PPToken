use crate::core::models::{AuthMode, PlanType};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::path::Path;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AuthTokens {
    pub id_token: Option<String>,
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub account_id: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AuthFile {
    pub auth_mode: Option<String>,
    #[serde(alias = "OPENAI_API_KEY")]
    pub openai_api_key: Option<String>,
    #[serde(default)]
    pub tokens: AuthTokens,
    pub last_refresh: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct AuthSnapshot {
    pub account_key: String,
    pub email: String,
    pub account_name: Option<String>,
    pub workspace_name: Option<String>,
    pub profile_name: Option<String>,
    pub plan: PlanType,
    pub auth_mode: AuthMode,
    pub created_at: i64,
}

#[derive(Debug, Clone)]
pub struct ApiRequestContext {
    pub auth_mode: AuthMode,
    pub bearer_token: Option<String>,
    pub api_key: Option<String>,
}

pub fn current_timestamp() -> i64 {
    chrono::Utc::now().timestamp()
}

pub fn load_auth_file(path: &Path) -> Result<AuthFile, crate::core::models::CoreError> {
    let raw = std::fs::read_to_string(path)?;
    Ok(serde_json::from_str(&raw)?)
}

pub fn make_api_request_context(auth: &AuthFile) -> Option<ApiRequestContext> {
    Some(ApiRequestContext {
        auth_mode: parse_auth_mode(auth.auth_mode.as_deref()),
        bearer_token: auth.tokens.access_token.clone().or(auth.tokens.id_token.clone()),
        api_key: auth.openai_api_key.clone(),
    })
}

pub fn make_auth_snapshot(
    auth: &AuthFile,
    path: &Path,
) -> Result<AuthSnapshot, crate::core::models::CoreError> {
    let raw: Value = std::fs::read_to_string(path)
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or(Value::Null);
    let auth_mode = parse_auth_mode(auth.auth_mode.as_deref());
    let email = string_at_paths(
        &raw,
        &[
            &["email"],
            &["account", "email"],
            &["profile", "email"],
            &["tokens", "email"],
        ],
    )
    .unwrap_or_else(|| match auth_mode {
        AuthMode::Apikey => "API Key".to_string(),
        AuthMode::Chatgpt => "ChatGPT Account".to_string(),
    });
    let account_name = string_at_paths(
        &raw,
        &[
            &["account", "name"],
            &["account_name"],
            &["accountName"],
            &["name"],
        ],
    );
    let workspace_name = string_at_paths(
        &raw,
        &[
            &["workspace", "name"],
            &["workspace_name"],
            &["workspaceName"],
            &["organization", "name"],
        ],
    );
    let profile_name = string_at_paths(
        &raw,
        &[
            &["profile", "name"],
            &["profile_name"],
            &["profileName"],
        ],
    );
    let plan = string_at_paths(
        &raw,
        &[
            &["plan"],
            &["account", "plan"],
            &["subscription", "plan"],
        ],
    )
    .map(|value| parse_plan(&value))
    .unwrap_or(PlanType::Unknown);
    let account_key = auth
        .tokens
        .account_id
        .clone()
        .or_else(|| string_at_paths(&raw, &[&["account_id"], &["accountId"], &["account", "id"]]))
        .unwrap_or_else(|| stable_account_key(auth, &email));

    Ok(AuthSnapshot {
        account_key,
        email,
        account_name,
        workspace_name,
        profile_name,
        plan,
        auth_mode,
        created_at: current_timestamp(),
    })
}

fn parse_auth_mode(value: Option<&str>) -> AuthMode {
    match value.unwrap_or_default().to_ascii_lowercase().as_str() {
        "apikey" | "api_key" | "api-key" => AuthMode::Apikey,
        _ => AuthMode::Chatgpt,
    }
}

fn parse_plan(value: &str) -> PlanType {
    match value.to_ascii_lowercase().as_str() {
        "free" => PlanType::Free,
        "plus" => PlanType::Plus,
        "pro5x" | "pro_5x" | "5x pro" => PlanType::Pro5x,
        "pro20x" | "pro_20x" | "20x pro" | "pro" => PlanType::Pro20x,
        "team" => PlanType::Team,
        "business" => PlanType::Business,
        "enterprise" => PlanType::Enterprise,
        "edu" | "education" => PlanType::Edu,
        _ => PlanType::Unknown,
    }
}

fn string_at_paths(value: &Value, paths: &[&[&str]]) -> Option<String> {
    paths.iter().find_map(|path| {
        let mut current = value;
        for segment in *path {
            current = current.get(*segment)?;
        }
        current.as_str().map(ToString::to_string)
    })
}

fn stable_account_key(auth: &AuthFile, email: &str) -> String {
    let source = auth
        .openai_api_key
        .as_deref()
        .or(auth.tokens.refresh_token.as_deref())
        .or(auth.tokens.access_token.as_deref())
        .or(auth.tokens.id_token.as_deref())
        .unwrap_or(email);
    let mut hasher = Sha256::new();
    hasher.update(source.as_bytes());
    format!("local-{:x}", hasher.finalize())
}
