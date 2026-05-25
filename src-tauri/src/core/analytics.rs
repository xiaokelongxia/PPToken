use crate::core::models::{
    ChangeAnalyticsPayload, ChangeDaySeries, CoreError, PilotSessionSummary, TokenAnalyticsPayload,
    TokenDaySeries, ToolAnalyticsPayload, ToolRankItem,
};
use crate::core::{pilot, quota_store};
use crate::platform::paths::CodexPaths;
use chrono::{DateTime, Local, TimeZone};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, HashMap};
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DailyActivity {
    pub date: String,
    pub session_count: i32,
    pub total_file_size: i64,
    pub activity_level: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TodaySummary {
    pub session_count: i32,
    pub total_file_size: i64,
    pub active_minutes_estimate: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionStats {
    pub total_sessions: i32,
    pub total_size_bytes: i64,
    pub active_days: i32,
    pub avg_sessions_per_active_day: f64,
    pub most_active_date: Option<String>,
    pub most_active_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UsageAnalyticsPayload {
    pub today: TodaySummary,
    pub session_stats: SessionStats,
    pub daily_activity: Vec<DailyActivity>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct QuotaHistoryPoint {
    pub timestamp: i64,
    pub account_key: String,
    pub primary_used_percent: Option<f64>,
    pub secondary_used_percent: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct QuotaHistoryPayload {
    pub points: Vec<QuotaHistoryPoint>,
}

#[derive(Debug, Default)]
struct ToolChangeCounts {
    tools: HashMap<String, i32>,
    commands: i32,
    write_ops: i32,
    read_ops: i32,
}

#[derive(Debug, Default)]
struct TokenDayAccumulator {
    total_tokens: i64,
}

#[derive(Debug, Default)]
struct ChangeDayAccumulator {
    commands: i32,
    write_ops: i32,
    read_ops: i32,
}

pub fn load_usage_analytics(
    paths: &CodexPaths,
    range: Option<&str>,
) -> Result<UsageAnalyticsPayload, CoreError> {
    let sessions = load_sessions(paths)?;
    Ok(build_usage_analytics(&sessions, range))
}

pub fn load_quota_history(paths: &CodexPaths) -> QuotaHistoryPayload {
    let mut points = load_quota_history_jsonl(&paths.quota_history_path);
    if points.is_empty() {
        let quota_store = quota_store::load_or_default(&paths.quota_store_path);
        points = quota_store
            .items
            .into_iter()
            .map(|item| QuotaHistoryPoint {
                timestamp: item.captured_at,
                account_key: item.account_key,
                primary_used_percent: item.primary_window.map(|window| window.used_percent),
                secondary_used_percent: item.secondary_window.map(|window| window.used_percent),
            })
            .collect();
    }
    points.sort_by_key(|point| point.timestamp);
    QuotaHistoryPayload { points }
}

pub fn load_token_analytics(
    paths: &CodexPaths,
    range: Option<&str>,
) -> Result<TokenAnalyticsPayload, CoreError> {
    let sessions = filter_sessions(load_sessions(paths)?, range);
    let mut by_date: BTreeMap<String, TokenDayAccumulator> = BTreeMap::new();
    let mut total_tokens = 0i64;

    for session in &sessions {
        let tokens = session.tokens_used.max(0);
        total_tokens += tokens;
        if let Some(date) = session_date_key(session) {
            by_date.entry(date).or_default().total_tokens += tokens;
        }
    }

    let mut cumulative = 0i64;
    let series = by_date
        .into_iter()
        .map(|(date, acc)| {
            cumulative += acc.total_tokens;
            TokenDaySeries {
                date,
                input_tokens: acc.total_tokens,
                output_tokens: 0,
                reasoning_tokens: 0,
                total_tokens: acc.total_tokens,
                cumulative,
            }
        })
        .collect::<Vec<_>>();

    let avg_per_session = if sessions.is_empty() {
        0.0
    } else {
        total_tokens as f64 / sessions.len() as f64
    };

    Ok(TokenAnalyticsPayload {
        total_tokens,
        avg_per_session,
        input_pct: if total_tokens > 0 { 100.0 } else { 0.0 },
        output_pct: 0.0,
        reasoning_pct: 0.0,
        input_total: total_tokens,
        output_total: 0,
        reasoning_total: 0,
        series,
    })
}

pub fn load_tool_analytics(
    paths: &CodexPaths,
    range: Option<&str>,
) -> Result<ToolAnalyticsPayload, CoreError> {
    let sessions = filter_sessions(load_sessions(paths)?, range);
    let counts = collect_rollout_counts(&sessions);
    let total_calls = counts.tools.values().sum();
    let mut top_tools = counts
        .tools
        .into_iter()
        .map(|(name, count)| ToolRankItem { name, count })
        .collect::<Vec<_>>();
    top_tools.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.name.cmp(&b.name)));
    top_tools.truncate(12);
    let search_count = top_tools
        .iter()
        .filter(|item| item.name.contains("search") || item.name == "web")
        .map(|item| item.count)
        .sum();
    let edit_count = top_tools
        .iter()
        .filter(|item| item.name.contains("apply_patch") || item.name.contains("write"))
        .map(|item| item.count)
        .sum();

    Ok(ToolAnalyticsPayload {
        total_calls,
        distinct_count: top_tools.len() as i32,
        search_count,
        edit_count,
        top_tools,
    })
}

pub fn load_change_analytics(
    paths: &CodexPaths,
    range: Option<&str>,
) -> Result<ChangeAnalyticsPayload, CoreError> {
    let sessions = filter_sessions(load_sessions(paths)?, range);
    let mut by_date: BTreeMap<String, ChangeDayAccumulator> = BTreeMap::new();
    let mut total = ChangeDayAccumulator::default();

    for session in &sessions {
        let Some(date) = session_date_key(session) else {
            continue;
        };
        let counts = collect_rollout_file_counts(Path::new(&session.path));
        let entry = by_date.entry(date).or_default();
        entry.commands += counts.commands;
        entry.write_ops += counts.write_ops;
        entry.read_ops += counts.read_ops;
        total.commands += counts.commands;
        total.write_ops += counts.write_ops;
        total.read_ops += counts.read_ops;
    }

    let series = by_date
        .into_iter()
        .map(|(date, acc)| ChangeDaySeries {
            date,
            commands: acc.commands,
            write_ops: acc.write_ops,
            read_ops: acc.read_ops,
        })
        .collect();
    let other_commands = (total.commands - total.write_ops - total.read_ops).max(0);

    Ok(ChangeAnalyticsPayload {
        total_commands: total.commands,
        write_commands: total.write_ops,
        read_commands: total.read_ops,
        other_commands,
        series,
    })
}

fn load_sessions(paths: &CodexPaths) -> Result<Vec<PilotSessionSummary>, CoreError> {
    pilot::load_sessions(paths)
        .map(|payload| payload.items)
        .map_err(CoreError::OperationFailed)
}

fn build_usage_analytics(
    sessions: &[PilotSessionSummary],
    range: Option<&str>,
) -> UsageAnalyticsPayload {
    let sessions = filter_sessions(sessions.to_vec(), range);
    let mut by_date: BTreeMap<String, (i32, i64)> = BTreeMap::new();
    let today_key = Local::now().format("%Y-%m-%d").to_string();

    for session in &sessions {
        let Some(date) = session_date_key(session) else {
            continue;
        };
        let entry = by_date.entry(date).or_insert((0, 0));
        entry.0 += 1;
        entry.1 += session.size_bytes as i64;
    }

    let daily_activity = by_date
        .iter()
        .map(|(date, (count, size))| DailyActivity {
            date: date.clone(),
            session_count: *count,
            total_file_size: *size,
            activity_level: ((*count + 1) / 2).clamp(1, 4),
        })
        .collect::<Vec<_>>();

    let today_activity = by_date.get(&today_key).copied().unwrap_or((0, 0));
    let total_sessions = sessions.len() as i32;
    let total_size_bytes = sessions
        .iter()
        .map(|session| session.size_bytes as i64)
        .sum();
    let active_days = by_date.len() as i32;
    let (most_active_date, most_active_count) = by_date
        .iter()
        .max_by(|a, b| a.1 .0.cmp(&b.1 .0).then_with(|| a.0.cmp(b.0)))
        .map(|(date, (count, _))| (Some(date.clone()), *count))
        .unwrap_or((None, 0));

    UsageAnalyticsPayload {
        today: TodaySummary {
            session_count: today_activity.0,
            total_file_size: today_activity.1,
            active_minutes_estimate: estimate_active_minutes(today_activity.0),
        },
        session_stats: SessionStats {
            total_sessions,
            total_size_bytes,
            active_days,
            avg_sessions_per_active_day: if active_days > 0 {
                total_sessions as f64 / active_days as f64
            } else {
                0.0
            },
            most_active_date,
            most_active_count,
        },
        daily_activity,
    }
}

fn filter_sessions(
    sessions: Vec<PilotSessionSummary>,
    range: Option<&str>,
) -> Vec<PilotSessionSummary> {
    let Some(cutoff) = range_cutoff_epoch(range) else {
        return sessions;
    };
    sessions
        .into_iter()
        .filter(|session| session_epoch(session).is_some_and(|epoch| epoch >= cutoff))
        .collect()
}

fn range_cutoff_epoch(range: Option<&str>) -> Option<i64> {
    let days = match range.unwrap_or("year") {
        "today" => 1,
        "week" => 7,
        "month" => 31,
        "year" => 366,
        "all" => return None,
        _ => 31,
    };
    Some(Local::now().timestamp() - (days as i64 * 86_400))
}

fn session_date_key(session: &PilotSessionSummary) -> Option<String> {
    let epoch = session_epoch(session)?;
    Local
        .timestamp_opt(epoch, 0)
        .single()
        .map(|dt| dt.format("%Y-%m-%d").to_string())
}

fn session_epoch(session: &PilotSessionSummary) -> Option<i64> {
    session.updated_at.or(session.created_at_epoch).or_else(|| {
        session
            .created_at
            .as_deref()
            .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
            .map(|dt| dt.timestamp())
    })
}

fn estimate_active_minutes(session_count: i32) -> i32 {
    if session_count <= 0 {
        0
    } else {
        (session_count * 8).clamp(3, 240)
    }
}

fn load_quota_history_jsonl(path: &Path) -> Vec<QuotaHistoryPoint> {
    let Ok(file) = File::open(path) else {
        return Vec::new();
    };
    BufReader::new(file)
        .lines()
        .map_while(Result::ok)
        .filter_map(|line| serde_json::from_str::<Value>(&line).ok())
        .filter_map(quota_point_from_value)
        .collect()
}

fn quota_point_from_value(value: Value) -> Option<QuotaHistoryPoint> {
    let timestamp = value
        .get("timestamp")
        .or_else(|| value.get("capturedAt"))
        .or_else(|| value.get("updatedAt"))
        .and_then(Value::as_i64)?;
    let account_key = value
        .get("accountKey")
        .or_else(|| value.get("account_key"))
        .and_then(Value::as_str)
        .unwrap_or("unknown")
        .to_string();
    let primary_used_percent = value
        .get("primaryUsedPercent")
        .and_then(Value::as_f64)
        .or_else(|| {
            value
                .get("primaryWindow")
                .and_then(|window| window.get("usedPercent"))
                .and_then(Value::as_f64)
        });
    let secondary_used_percent = value
        .get("secondaryUsedPercent")
        .and_then(Value::as_f64)
        .or_else(|| {
            value
                .get("secondaryWindow")
                .and_then(|window| window.get("usedPercent"))
                .and_then(Value::as_f64)
        });

    Some(QuotaHistoryPoint {
        timestamp,
        account_key,
        primary_used_percent,
        secondary_used_percent,
    })
}

fn collect_rollout_counts(sessions: &[PilotSessionSummary]) -> ToolChangeCounts {
    let mut total = ToolChangeCounts::default();
    for session in sessions {
        let counts = collect_rollout_file_counts(Path::new(&session.path));
        for (name, count) in counts.tools {
            *total.tools.entry(name).or_default() += count;
        }
        total.commands += counts.commands;
        total.write_ops += counts.write_ops;
        total.read_ops += counts.read_ops;
    }
    total
}

fn collect_rollout_file_counts(path: &Path) -> ToolChangeCounts {
    let Ok(file) = File::open(path) else {
        return ToolChangeCounts::default();
    };
    let mut counts = ToolChangeCounts::default();
    for line in BufReader::new(file).lines().map_while(Result::ok) {
        count_tool_markers(&line, &mut counts);
    }
    counts
}

fn count_tool_markers(line: &str, counts: &mut ToolChangeCounts) {
    const MARKERS: &[(&str, &str)] = &[
        ("exec_command", "exec_command"),
        ("write_stdin", "write_stdin"),
        ("apply_patch", "apply_patch"),
        ("spawn_agent", "spawn_agent"),
        ("wait_agent", "wait_agent"),
        ("web.run", "web"),
        ("search_query", "web_search"),
        ("mcp__computer_use", "computer_use"),
        ("mcp__node_repl", "node_repl"),
    ];

    for (needle, name) in MARKERS {
        let count = line.matches(needle).count() as i32;
        if count == 0 {
            continue;
        }
        *counts.tools.entry((*name).to_string()).or_default() += count;
        counts.commands += count;
        if matches!(*name, "apply_patch" | "write_stdin") {
            counts.write_ops += count;
        } else if matches!(*name, "exec_command" | "web" | "web_search" | "node_repl") {
            counts.read_ops += count;
        }
    }
}
