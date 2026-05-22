use crate::core::auth::current_timestamp;
use crate::core::models::*;
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub fn load_admin_content(path: &Path) -> Result<AdminContentFile, CoreError> {
    if !path.exists() {
        let content = default_admin_content();
        save_admin_content(path, content.clone())?;
        return Ok(content);
    }

    let raw = fs::read_to_string(path)?;
    let mut content: AdminContentFile = serde_json::from_str(&raw)?;
    normalize_admin_content(&mut content);
    Ok(content)
}

pub fn save_admin_content(
    path: &Path,
    mut content: AdminContentFile,
) -> Result<AdminContentFile, CoreError> {
    normalize_admin_content(&mut content);
    content.updated_at = current_timestamp();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let raw = serde_json::to_string_pretty(&content)?;
    fs::write(path, format!("{raw}\n"))?;
    Ok(content)
}

pub fn submit_feedback(
    path: &Path,
    text: String,
) -> Result<(AdminContentFile, AdminFeedbackItem), CoreError> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err(CoreError::InvalidData("feedback text is empty".to_string()));
    }

    let mut content = load_admin_content(path)?;
    let item = AdminFeedbackItem {
        id: format!("feedback-{}", Uuid::new_v4()),
        text: trimmed.to_string(),
        status: "new".to_string(),
        created_at: current_timestamp(),
    };
    content.feedback_items.insert(0, item.clone());
    let saved = save_admin_content(path, content)?;
    Ok((saved, item))
}

pub fn verify_mystery_code(path: &Path, code: String) -> Result<MysteryCodeVerifyPayload, CoreError> {
    let content = load_admin_content(path)?;
    let trimmed = code.trim();
    let matched = content
        .topbar
        .mystery
        .codes
        .iter()
        .find(|item| item.enabled && item.code.trim().eq_ignore_ascii_case(trimmed));

    Ok(match matched {
        Some(item) => MysteryCodeVerifyPayload {
            matched: true,
            title: item.title.clone(),
            message: item.message.clone(),
        },
        None => MysteryCodeVerifyPayload {
            matched: false,
            title: content.topbar.mystery.invalid_title,
            message: content.topbar.mystery.invalid_message,
        },
    })
}

pub fn load_plugin_state(
    plugin_root: &Path,
    admin_content_path: &Path,
) -> Result<PluginStatePayload, CoreError> {
    let content = load_admin_content(admin_content_path)?;
    let mut installed = scan_installed_plugins(plugin_root)?;
    installed.sort_by(|a, b| {
        a.display_name
            .to_lowercase()
            .cmp(&b.display_name.to_lowercase())
            .then_with(|| a.relative_path.cmp(&b.relative_path))
    });

    Ok(PluginStatePayload {
        installed,
        catalog: sorted_plugin_catalog(content.plugin_catalog),
        plugin_root_path: plugin_root.display().to_string(),
        source_path: admin_content_path.display().to_string(),
        last_scan_at: current_timestamp(),
    })
}

fn default_admin_content() -> AdminContentFile {
    let now = current_timestamp();
    AdminContentFile {
        schema_version: 1,
        relay_stations: vec![
            AdminRelayStation {
                id: "pptoken".to_string(),
                name: "PPToken".to_string(),
                base_url: "https://api.pptoken.org/v1".to_string(),
                register_url: "https://api.pptoken.org/register?promo=PPTOKENCC".to_string(),
                promo_code: Some("pptokencc".to_string()),
                description: "感谢 PPToken.org 赞助本项目！PPToken.org 主打 GPT 系列模型 API 中转服务，支持 Codex、Claude Code、OpenAI 兼容客户端及 Gemini CLI 等工具接入。充值 1:1，1 元=1 美元额度；GPT 模型最低 0.16 倍倍率，综合成本约为官方价格的 0.22 折，最快首字 Token 约 1 秒，适合开发者低成本、高响应速度接入 GPT 模型能力。技术支持：7×24 小时真人响应，群内@技术，10 分钟内有回复。\n\n赞助商福利：前 200 名用户通过专属注册链接注册，输入优惠码 `pptokencc`，可领取 Codex / Claude Code 免费试用额度，无门槛、不绑卡。".to_string(),
                placeholder: false,
                enabled: true,
                sort_order: 10,
            },
            AdminRelayStation {
                id: "sponsor-slot-02".to_string(),
                name: "推荐中转站 02".to_string(),
                base_url: "".to_string(),
                register_url: "".to_string(),
                promo_code: None,
                description: "预留给后续接入的赞助中转站位置。".to_string(),
                placeholder: true,
                enabled: true,
                sort_order: 20,
            },
            AdminRelayStation {
                id: "sponsor-slot-03".to_string(),
                name: "推荐中转站 03".to_string(),
                base_url: "".to_string(),
                register_url: "".to_string(),
                promo_code: None,
                description: "预留给后续接入的赞助中转站位置。".to_string(),
                placeholder: true,
                enabled: true,
                sort_order: 30,
            },
        ],
        plugin_catalog: vec![
            AdminPluginCatalogItem {
                id: "browser".to_string(),
                name: "browser".to_string(),
                display_name: "Browser".to_string(),
                description: "Codex 内置浏览器自动化插件，用于打开、检查和测试本地网页目标。".to_string(),
                category: "Automation".to_string(),
                version: Some("bundled".to_string()),
                source_url: None,
                install_command: None,
                enabled: true,
                sort_order: 10,
            },
            AdminPluginCatalogItem {
                id: "chrome".to_string(),
                name: "chrome".to_string(),
                display_name: "Chrome".to_string(),
                description: "使用用户 Chrome 登录态、标签页和扩展能力的浏览器自动化插件。".to_string(),
                category: "Automation".to_string(),
                version: Some("bundled".to_string()),
                source_url: None,
                install_command: None,
                enabled: true,
                sort_order: 20,
            },
            AdminPluginCatalogItem {
                id: "computer-use".to_string(),
                name: "computer-use".to_string(),
                display_name: "Computer Use".to_string(),
                description: "控制本机桌面应用窗口、点击、输入和读取界面的插件。".to_string(),
                category: "System".to_string(),
                version: Some("bundled".to_string()),
                source_url: None,
                install_command: None,
                enabled: true,
                sort_order: 30,
            },
        ],
        topbar: AdminTopbarConfig {
            feedback: AdminFeedbackConfig {
                title: "意见反馈".to_string(),
                description: "提交问题、建议或异常现象，以帮助 PPToken 迭代升级，改进产品。".to_string(),
                placeholder: "请描述你遇到的问题或建议…".to_string(),
                submit_label: "提交反馈".to_string(),
            },
            mystery: AdminMysteryConfig {
                title: "神秘代码".to_string(),
                description: "一个说不清道不明的通道，随机掉落惊喜".to_string(),
                placeholder: "请输入口令".to_string(),
                verify_label: "验证".to_string(),
                invalid_title: "口令暂未生效".to_string(),
                invalid_message: "请检查口令后再试。".to_string(),
                codes: vec![AdminMysteryCode {
                    id: "default-code".to_string(),
                    code: "pptoken".to_string(),
                    title: "口令已验证".to_string(),
                    message: "后台神秘代码通道已经可用。".to_string(),
                    enabled: true,
                }],
            },
            notifications: vec![AdminNotification {
                id: "welcome".to_string(),
                title: "PPToken 已就绪".to_string(),
                body: "中转注入、线程管理、插件扫描和后台配置已接入本地数据源。".to_string(),
                level: "info".to_string(),
                enabled: true,
                sort_order: 10,
            }],
            messages: vec![AdminMessage {
                id: "group".to_string(),
                title: "消息".to_string(),
                body: "群聊掉落口令".to_string(),
                action_label: None,
                action_url: None,
                qr_text: Some("https://pptoken.org".to_string()),
                enabled: true,
                sort_order: 10,
            }],
        },
        feedback_items: vec![],
        updated_at: now,
    }
}

fn normalize_admin_content(content: &mut AdminContentFile) {
    content.schema_version = 1;
    assign_ids(&mut content.relay_stations, "relay", |item| &mut item.id);
    assign_ids(&mut content.plugin_catalog, "plugin", |item| &mut item.id);
    assign_ids(&mut content.topbar.notifications, "notice", |item| &mut item.id);
    assign_ids(&mut content.topbar.messages, "message", |item| &mut item.id);
    assign_ids(&mut content.topbar.mystery.codes, "code", |item| &mut item.id);
}

fn assign_ids<T, F>(items: &mut [T], prefix: &str, mut id_of: F)
where
    F: FnMut(&mut T) -> &mut String,
{
    for item in items {
        if id_of(item).trim().is_empty() {
            *id_of(item) = format!("{prefix}-{}", Uuid::new_v4());
        }
    }
}

fn sorted_plugin_catalog(mut items: Vec<AdminPluginCatalogItem>) -> Vec<AdminPluginCatalogItem> {
    items.sort_by(|a, b| {
        a.sort_order
            .cmp(&b.sort_order)
            .then_with(|| a.display_name.to_lowercase().cmp(&b.display_name.to_lowercase()))
    });
    items
}

fn scan_installed_plugins(root: &Path) -> Result<Vec<InstalledPluginSummary>, CoreError> {
    if !root.exists() {
        return Ok(vec![]);
    }
    let mut manifests = Vec::new();
    collect_plugin_manifests(root, &mut manifests);

    let mut deduped: HashMap<PathBuf, InstalledPluginSummary> = HashMap::new();
    for manifest_path in manifests {
        if let Some(item) = load_plugin_manifest(root, &manifest_path) {
            let key = fs::canonicalize(&item.directory_path)
                .unwrap_or_else(|_| PathBuf::from(&item.directory_path));
            match deduped.get(&key) {
                Some(existing) if should_replace_plugin_summary(existing, &item) => {
                    deduped.insert(key, item);
                }
                None => {
                    deduped.insert(key, item);
                }
                _ => {}
            }
        }
    }
    let items = deduped.into_values().collect();
    Ok(items)
}

fn collect_plugin_manifests(dir: &Path, manifests: &mut Vec<PathBuf>) {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with('.'))
        {
            continue;
        }
        if path.is_dir() {
            let manifest_path = path.join(".codex-plugin").join("plugin.json");
            if manifest_path.exists() {
                manifests.push(manifest_path);
            } else {
                collect_plugin_manifests(&path, manifests);
            }
        }
    }
}

fn load_plugin_manifest(root: &Path, manifest_path: &Path) -> Option<InstalledPluginSummary> {
    let raw = fs::read_to_string(manifest_path).ok()?;
    let value: Value = serde_json::from_str(&raw).ok()?;
    let dir = manifest_path.parent()?.parent()?.to_path_buf();
    let interface = value.get("interface").unwrap_or(&Value::Null);
    let name = string_field(&value, "name").unwrap_or_else(|| {
        dir.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("plugin")
            .to_string()
    });
    let display_name = string_field(interface, "displayName").unwrap_or_else(|| name.clone());
    let category = string_field(interface, "category");
    let developer_name = string_field(interface, "developerName").or_else(|| {
        value
            .get("author")
            .and_then(|author| string_field(author, "name"))
    });
    let homepage = plugin_homepage(&value, interface);
    let repository = value.get("repository").and_then(repository_url);
    let relative_path = dir
        .strip_prefix(root)
        .map(|path| path.display().to_string())
        .unwrap_or_else(|_| dir.display().to_string());
    let updated_at = fs::metadata(manifest_path)
        .ok()
        .and_then(|meta| meta.modified().ok())
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs() as i64);

    Some(InstalledPluginSummary {
        id: relative_path.clone(),
        name,
        display_name,
        version: string_field(&value, "version"),
        description: string_field(&value, "description")
            .or_else(|| string_field(interface, "shortDescription")),
        category,
        developer_name,
        homepage,
        repository,
        capabilities: string_array_field(interface, "capabilities"),
        skill_count: count_skill_entries(&value, &dir),
        mcp_server_count: count_mcp_server_entries(&value, &dir),
        manifest_path: manifest_path.display().to_string(),
        directory_path: dir.display().to_string(),
        relative_path,
        updated_at,
    })
}

fn string_field(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(ToOwned::to_owned)
}

fn string_array_field(value: &Value, key: &str) -> Vec<String> {
    value
        .get(key)
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|text| !text.is_empty())
                .map(ToOwned::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

fn collection_len(value: &Value) -> i32 {
    match value {
        Value::Object(map) => map.len() as i32,
        Value::Array(items) => items.len() as i32,
        _ => 0,
    }
}

fn count_skill_entries(value: &Value, plugin_dir: &Path) -> i32 {
    match value.get("skills") {
        Some(Value::Object(map)) => map.len() as i32,
        Some(Value::Array(items)) => items.len() as i32,
        Some(Value::String(path)) => count_skill_files(&plugin_dir.join(path)),
        _ => 0,
    }
}

fn count_mcp_server_entries(value: &Value, plugin_dir: &Path) -> i32 {
    match value.get("mcpServers") {
        Some(Value::Object(map)) => map.len() as i32,
        Some(Value::Array(items)) => items.len() as i32,
        Some(Value::String(path)) => count_json_collection(&plugin_dir.join(path), "mcpServers"),
        _ => 0,
    }
}

fn count_json_collection(path: &Path, key: &str) -> i32 {
    let raw = match fs::read_to_string(path) {
        Ok(raw) => raw,
        Err(_) => return 0,
    };
    let value: Value = match serde_json::from_str(&raw) {
        Ok(value) => value,
        Err(_) => return 0,
    };
    value
        .get(key)
        .map(collection_len)
        .unwrap_or_else(|| collection_len(&value))
}

fn count_skill_files(path: &Path) -> i32 {
    if !path.exists() {
        return 0;
    }
    let mut total = 0;
    count_skill_files_recursive(path, &mut total);
    total
}

fn count_skill_files_recursive(dir: &Path, total: &mut i32) {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with('.'))
        {
            continue;
        }
        if path.is_dir() {
            let skill_file = path.join("SKILL.md");
            if skill_file.exists() {
                *total += 1;
            } else {
                count_skill_files_recursive(&path, total);
            }
        }
    }
}

fn should_replace_plugin_summary(
    existing: &InstalledPluginSummary,
    candidate: &InstalledPluginSummary,
) -> bool {
    let existing_latest = existing.relative_path.ends_with("/latest");
    let candidate_latest = candidate.relative_path.ends_with("/latest");
    match (existing_latest, candidate_latest) {
        (true, false) => true,
        (false, true) => false,
        _ => candidate.updated_at.unwrap_or(0) > existing.updated_at.unwrap_or(0),
    }
}

fn repository_url(value: &Value) -> Option<String> {
    match value {
        Value::String(url) => Some(url.clone()),
        Value::Object(_) => string_field(value, "url"),
        _ => None,
    }
}

fn plugin_homepage(value: &Value, interface: &Value) -> Option<String> {
    let website_url = string_field(interface, "websiteURL");
    let homepage = string_field(value, "homepage");
    if homepage
        .as_deref()
        .is_some_and(is_openai_internal_source_url)
    {
        return website_url.or(homepage);
    }
    homepage.or(website_url)
}

fn is_openai_internal_source_url(url: &str) -> bool {
    let normalized = url.trim_end_matches('/');
    normalized.starts_with("https://github.com/openai/openai/tree/")
        || normalized.starts_with("https://github.com/openai/openai/blob/")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn load_admin_content_creates_default_file() {
        let dir = std::env::temp_dir().join(format!("pptoken-admin-test-{}", Uuid::new_v4()));
        let path = dir.join("admin-content.json");

        let content = load_admin_content(&path).expect("default admin content");

        assert!(path.exists());
        assert!(content.relay_stations.iter().any(|item| item.id == "pptoken"));
        assert!(content.plugin_catalog.iter().any(|item| item.id == "browser"));
        assert_eq!(content.topbar.feedback.title, "意见反馈");

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn load_plugin_state_scans_manifest() {
        let dir = std::env::temp_dir().join(format!("pptoken-plugin-test-{}", Uuid::new_v4()));
        let plugin_dir = dir.join("cache").join("sample").join("1.0.0");
        let manifest_dir = plugin_dir.join(".codex-plugin");
        fs::create_dir_all(&manifest_dir).expect("manifest dir");
        fs::write(
            manifest_dir.join("plugin.json"),
            r#"{
              "name": "sample",
              "version": "1.0.0",
              "description": "Sample plugin",
              "repository": { "url": "https://example.com/sample" },
              "skills": { "sample": {} },
              "mcpServers": { "sample": {} },
              "interface": {
                "displayName": "Sample Plugin",
                "category": "Testing",
                "developerName": "PPToken",
                "capabilities": ["browser", "files"]
              }
            }"#,
        )
        .expect("manifest");
        let admin_path = dir.join("admin-content.json");

        let payload = load_plugin_state(&dir, &admin_path).expect("plugin state");

        assert_eq!(payload.installed.len(), 1);
        assert_eq!(payload.installed[0].display_name, "Sample Plugin");
        assert_eq!(payload.installed[0].skill_count, 1);
        assert_eq!(payload.installed[0].mcp_server_count, 1);
        assert_eq!(payload.installed[0].capabilities.len(), 2);

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn load_plugin_state_uses_public_website_for_internal_openai_source_homepage() {
        let dir = std::env::temp_dir().join(format!("pptoken-plugin-test-{}", Uuid::new_v4()));
        let plugin_dir = dir.join("cache").join("browser").join("1.0.0");
        let manifest_dir = plugin_dir.join(".codex-plugin");
        fs::create_dir_all(&manifest_dir).expect("manifest dir");
        fs::write(
            manifest_dir.join("plugin.json"),
            r#"{
              "name": "browser",
              "homepage": "https://github.com/openai/openai/tree/master/lib/browser_use/plugin",
              "interface": {
                "displayName": "Browser",
                "websiteURL": "https://openai.com/",
                "capabilities": []
              }
            }"#,
        )
        .expect("manifest");
        let admin_path = dir.join("admin-content.json");

        let payload = load_plugin_state(&dir, &admin_path).expect("plugin state");

        assert_eq!(payload.installed.len(), 1);
        assert_eq!(
            payload.installed[0].homepage.as_deref(),
            Some("https://openai.com/")
        );

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn load_plugin_state_counts_string_based_skills_and_mcp_servers() {
        let dir = std::env::temp_dir().join(format!("pptoken-plugin-test-{}", Uuid::new_v4()));
        let plugin_dir = dir.join("cache").join("browser").join("0.1.0-alpha2");
        let manifest_dir = plugin_dir.join(".codex-plugin");
        let skills_dir = plugin_dir.join("skills").join("browser");
        fs::create_dir_all(&manifest_dir).expect("manifest dir");
        fs::create_dir_all(&skills_dir).expect("skills dir");
        fs::write(
            skills_dir.join("SKILL.md"),
            "# Browser\n\nUse the local browser.\n",
        )
        .expect("skill file");
        fs::write(
            plugin_dir.join(".mcp.json"),
            r#"{
              "mcpServers": {
                "browser": {
                  "command": "browser-client"
                }
              }
            }"#,
        )
        .expect("mcp file");
        fs::write(
            manifest_dir.join("plugin.json"),
            r#"{
              "name": "browser",
              "version": "0.1.0-alpha2",
              "skills": "./skills/",
              "mcpServers": "./.mcp.json",
              "interface": {
                "displayName": "Browser",
                "capabilities": []
              }
            }"#,
        )
        .expect("manifest");
        let admin_path = dir.join("admin-content.json");

        let payload = load_plugin_state(&dir, &admin_path).expect("plugin state");

        assert_eq!(payload.installed.len(), 1);
        assert_eq!(payload.installed[0].skill_count, 1);
        assert_eq!(payload.installed[0].mcp_server_count, 1);

        let _ = fs::remove_dir_all(dir);
    }

    #[cfg(unix)]
    #[test]
    fn load_plugin_state_deduplicates_latest_alias() {
        use std::os::unix::fs::symlink;

        let dir = std::env::temp_dir().join(format!("pptoken-plugin-test-{}", Uuid::new_v4()));
        let real_dir = dir.join("cache").join("chrome").join("0.1.7");
        let manifest_dir = real_dir.join(".codex-plugin");
        fs::create_dir_all(&manifest_dir).expect("manifest dir");
        fs::write(
            manifest_dir.join("plugin.json"),
            r#"{
              "name": "chrome",
              "version": "0.1.7",
              "interface": {
                "displayName": "Chrome",
                "capabilities": []
              }
            }"#,
        )
        .expect("manifest");
        let latest_dir = dir.join("cache").join("chrome").join("latest");
        symlink(&real_dir, &latest_dir).expect("latest symlink");
        let admin_path = dir.join("admin-content.json");

        let payload = load_plugin_state(&dir, &admin_path).expect("plugin state");

        assert_eq!(payload.installed.len(), 1);
        assert_eq!(payload.installed[0].relative_path, "cache/chrome/0.1.7");

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn verify_mystery_code_accepts_case_variants() {
        let dir = std::env::temp_dir().join(format!("pptoken-admin-test-{}", Uuid::new_v4()));
        let path = dir.join("admin-content.json");
        let payload = verify_mystery_code(&path, "Pptoken".to_string()).expect("mystery code");

        assert!(payload.matched);
        assert_eq!(payload.title, "口令已验证");

        let _ = fs::remove_dir_all(dir);
    }
}
