use std::{
    ffi::OsString,
    path::{Path, PathBuf},
};

#[derive(Clone)]
pub struct CodexPaths {
    pub codex_home: PathBuf,
    pub auth_path: PathBuf,
    pub config_path: PathBuf,
    pub session_index_path: PathBuf,
    /// Codex 客户端真正的 session 索引数据库（SQLite）。
    ///
    /// 历史上我们以为 `session_index.jsonl` 是 codex 列表来源，但实测
    /// codex 启动后会**反向覆盖**这个 jsonl 文件，且其线程列表来自
    /// `state_5.sqlite` 的 `threads` 表 —— 我们之前往 jsonl 写恢复记录
    /// 完全无效。所有"恢复 / 是否被 codex 看到" 的判定都必须以这个文件为准。
    pub codex_state_db_path: PathBuf,
    pub sessions_dir: PathBuf,
    pub archived_sessions_dir: PathBuf,
    pub skills_dir: PathBuf,
    pub plugins_dir: PathBuf,
    pub accounts_dir: PathBuf,
    pub registry_path: PathBuf,
    pub snapshots_dir: PathBuf,
    pub auth_backups_dir: PathBuf,
    pub registry_backups_dir: PathBuf,
    pub auto_switch_log_path: PathBuf,
    pub codexmate_dir: PathBuf,
    pub skill_backups_dir: PathBuf,
    pub quota_history_path: PathBuf,
    pub quota_store_path: PathBuf,
    pub settings_path: PathBuf,
    pub bootstrap_cache_path: PathBuf,
    pub auto_switch_pending_path: PathBuf,
    pub auto_switch_snooze_path: PathBuf,
    pub voice_workspace_path: PathBuf,
    pub voice_runtime_path: PathBuf,
    pub admin_content_path: PathBuf,
    pub launch_agent_path: PathBuf,
    pub global_agents_path: PathBuf,
    pub custom_instructions_dir: PathBuf,
    pub custom_instruction_history_dir: PathBuf,
}

impl CodexPaths {
    pub fn new() -> Self {
        let codex_home = Self::resolve_codex_home();
        Self::from_home(codex_home)
    }

    pub fn from_home(codex_home: PathBuf) -> Self {
        let accounts_dir = codex_home.join("accounts");
        let pptoken_dir = codex_home.join("pptoken");
        let custom_instructions_dir = pptoken_dir.join("custom-instructions");
        let launch_agent_path = Self::resolve_launch_agent_path();

        Self {
            auth_path: codex_home.join("auth.json"),
            config_path: codex_home.join("config.toml"),
            session_index_path: codex_home.join("session_index.jsonl"),
            codex_state_db_path: codex_home.join("state_5.sqlite"),
            sessions_dir: codex_home.join("sessions"),
            archived_sessions_dir: codex_home.join("archived_sessions"),
            skills_dir: codex_home.join("skills"),
            plugins_dir: codex_home.join("plugins"),
            registry_path: accounts_dir.join("registry.json"),
            snapshots_dir: accounts_dir.join("snapshots"),
            auth_backups_dir: accounts_dir.join("backups"),
            registry_backups_dir: accounts_dir.join("registry-backups"),
            auto_switch_log_path: accounts_dir.join("auto-switch.log"),
            skill_backups_dir: pptoken_dir.join("skill-backups"),
            quota_history_path: pptoken_dir.join("quota-history.jsonl"),
            quota_store_path: pptoken_dir.join("quota-store.json"),
            settings_path: pptoken_dir.join("settings.json"),
            bootstrap_cache_path: pptoken_dir.join("bootstrap-cache.json"),
            auto_switch_pending_path: pptoken_dir.join("auto-switch-pending.json"),
            auto_switch_snooze_path: pptoken_dir.join("auto-switch-snooze.json"),
            voice_workspace_path: pptoken_dir.join("voice-workspace.json"),
            voice_runtime_path: pptoken_dir.join("voice-runtime.json"),
            admin_content_path: pptoken_dir.join("admin-content.json"),
            global_agents_path: codex_home.join("AGENTS.md"),
            custom_instruction_history_dir: custom_instructions_dir.join("history"),
            accounts_dir,
            codexmate_dir: pptoken_dir,
            custom_instructions_dir,
            launch_agent_path,
            codex_home,
        }
    }

    fn resolve_codex_home() -> PathBuf {
        Self::resolve_codex_home_from(std::env::var_os("CODEX_HOME"), dirs::home_dir())
    }

    fn resolve_codex_home_from(
        codex_home_env: Option<OsString>,
        home_dir: Option<PathBuf>,
    ) -> PathBuf {
        let default_home = default_codex_home(home_dir);
        Self::resolve_codex_home_from_default(codex_home_env, default_home)
    }

    fn resolve_codex_home_from_default(
        codex_home_env: Option<OsString>,
        default_home: PathBuf,
    ) -> PathBuf {
        if let Some(path) = codex_home_env.and_then(normalize_codex_home_env) {
            return choose_codex_home(path, default_home);
        }
        default_home
    }

    #[cfg(target_os = "macos")]
    fn resolve_launch_agent_path() -> PathBuf {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("Library/LaunchAgents/dev.pptoken.auto-switch.plist")
    }

    #[cfg(not(target_os = "macos"))]
    fn resolve_launch_agent_path() -> PathBuf {
        PathBuf::new()
    }
}

fn normalize_codex_home_env(value: OsString) -> Option<PathBuf> {
    let raw = value.to_string_lossy();
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let unquoted = strip_wrapping_quotes(trimmed).trim();
    if unquoted.is_empty() {
        return None;
    }
    Some(PathBuf::from(unquoted))
}

fn choose_codex_home(env_home: PathBuf, default_home: PathBuf) -> PathBuf {
    let env_has_markers = has_codex_home_markers(&env_home);
    let default_has_markers = has_codex_home_markers(&default_home);

    if env_has_markers {
        env_home
    } else if default_has_markers {
        default_home
    } else if env_home.exists() || !default_home.exists() {
        env_home
    } else {
        default_home
    }
}

fn has_codex_home_markers(path: &Path) -> bool {
    path.join("auth.json").is_file()
        || path.join("config.toml").is_file()
        || path.join("state_5.sqlite").is_file()
        || path.join("session_index.jsonl").is_file()
        || path.join("sessions").is_dir()
        || path.join("skills").is_dir()
        || path.join("plugins").is_dir()
}

fn strip_wrapping_quotes(value: &str) -> &str {
    let bytes = value.as_bytes();
    if bytes.len() >= 2
        && ((bytes[0] == b'"' && bytes[bytes.len() - 1] == b'"')
            || (bytes[0] == b'\'' && bytes[bytes.len() - 1] == b'\''))
    {
        &value[1..value.len() - 1]
    } else {
        value
    }
}

fn default_codex_home(home_dir: Option<PathBuf>) -> PathBuf {
    home_dir
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".codex")
}

impl CodexPaths {
    pub fn ensure_directories(&self) -> std::io::Result<()> {
        std::fs::create_dir_all(&self.accounts_dir)?;
        std::fs::create_dir_all(&self.snapshots_dir)?;
        std::fs::create_dir_all(&self.auth_backups_dir)?;
        std::fs::create_dir_all(&self.registry_backups_dir)?;
        std::fs::create_dir_all(&self.archived_sessions_dir)?;
        std::fs::create_dir_all(&self.codexmate_dir)?;
        std::fs::create_dir_all(&self.skill_backups_dir)?;
        std::fs::create_dir_all(&self.custom_instructions_dir)?;
        std::fs::create_dir_all(&self.custom_instruction_history_dir)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_default_user_codex_home_without_env() {
        let resolved =
            CodexPaths::resolve_codex_home_from(None, Some(PathBuf::from("/Users/alice")));
        assert_eq!(resolved, PathBuf::from("/Users/alice/.codex"));
    }

    #[test]
    fn ignores_empty_codex_home_env() {
        let resolved = CodexPaths::resolve_codex_home_from(
            Some(OsString::from("   ")),
            Some(PathBuf::from("/Users/alice")),
        );
        assert_eq!(resolved, PathBuf::from("/Users/alice/.codex"));
    }

    #[test]
    fn normalizes_quoted_codex_home_env() {
        let resolved = CodexPaths::resolve_codex_home_from(
            Some(OsString::from("\"/tmp/custom-codex\"")),
            Some(PathBuf::from("/Users/alice")),
        );
        assert_eq!(resolved, PathBuf::from("/tmp/custom-codex"));
    }

    #[test]
    fn prefers_existing_default_codex_home_over_missing_env_path() {
        let default_home = std::env::temp_dir().join(format!(
            "pptoken-existing-default-codex-home-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&default_home);
        std::fs::create_dir_all(&default_home).unwrap();

        let missing_env_home = default_home.with_extension("missing-env-home");
        let resolved = CodexPaths::resolve_codex_home_from_default(
            Some(OsString::from(missing_env_home.as_os_str())),
            default_home.clone(),
        );

        assert_eq!(resolved, default_home);
        let _ = std::fs::remove_dir_all(resolved);
    }

    #[test]
    fn prefers_marked_default_codex_home_over_empty_env_path() {
        let default_home = temp_test_home("marked-default").join(".codex");
        let env_home = temp_test_home("empty-env").join(".codex");
        let _ = std::fs::remove_dir_all(&default_home);
        let _ = std::fs::remove_dir_all(&env_home);
        std::fs::create_dir_all(&default_home).unwrap();
        std::fs::create_dir_all(&env_home).unwrap();
        std::fs::write(default_home.join("config.toml"), "model = \"gpt-5.1\"\n").unwrap();

        let resolved = CodexPaths::resolve_codex_home_from_default(
            Some(env_home.into_os_string()),
            default_home.clone(),
        );

        assert_eq!(resolved, default_home);
        let _ = std::fs::remove_dir_all(temp_test_home("marked-default"));
        let _ = std::fs::remove_dir_all(temp_test_home("empty-env"));
    }

    #[test]
    fn honors_marked_codex_home_env() {
        let default_home = temp_test_home("marked-default-ignored").join(".codex");
        let env_home = temp_test_home("marked-env").join(".codex");
        let _ = std::fs::remove_dir_all(&default_home);
        let _ = std::fs::remove_dir_all(&env_home);
        std::fs::create_dir_all(&default_home).unwrap();
        std::fs::create_dir_all(&env_home).unwrap();
        std::fs::write(default_home.join("config.toml"), "model = \"gpt-5.1\"\n").unwrap();
        std::fs::write(env_home.join("auth.json"), "{}\n").unwrap();

        let resolved = CodexPaths::resolve_codex_home_from_default(
            Some(env_home.clone().into_os_string()),
            default_home,
        );

        assert_eq!(resolved, env_home);
        let _ = std::fs::remove_dir_all(temp_test_home("marked-default-ignored"));
        let _ = std::fs::remove_dir_all(temp_test_home("marked-env"));
    }

    fn temp_test_home(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("pptoken-codex-paths-{name}-{}", std::process::id()))
    }
}
