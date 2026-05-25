import type {
  CoreEnvelope,
  CoreSnapshotPayload,
  BootstrapStatePayload,
  CleanPayload,
  RebuildRegistryPayload,
  AutoSwitchConfigPayload,
  ApiProxyMode,
  ApiModePayload,
  ApiProxyDetectPayload,
  ApiProxyTestPayload,
  UpdateInstallabilityPayload,
  DaemonRunPayload,
  DiagnosePayload,
  McpServerListPayload,
  McpServerMutationPayload,
  McpServerRemovePayload,
  SkillListPayload,
  SkillBackupListPayload,
  SkillImportPayload,
  SkillRemovePayload,
  SkillRestorePayload,
  SkillDeleteBackupPayload,
  CustomInstructionPreviewPayload,
  CustomInstructionStatePayload,
  McpTransport,
  PilotAccountsPayload,
  PilotSessionsPayload,
  PilotSessionDeletePayload,
  PilotSessionRestorePayload,
  AccountImportPreviewPayload,
  AccountImportPayload,
  AccountExportPayload,
  AccountSwitchPayload,
  AccountRemovePayload,
  PilotRoutingPayload,
  RelayStatePayload,
  RelayMutationPayload,
  RelayTestPayload,
  RelayProxyState,
  RelayUpsertInput,
  RelayModelFetchDraftInput,
  RelayRouteDiagnosticPayload,
  RelayModelFetchPayload,
  RelayExportPayload,
  RelayImportPayload,
  AdminContentFile,
  AdminContentPayload,
  FeedbackSubmitPayload,
  MysteryCodeVerifyPayload,
  PluginStatePayload,
  UsageAnalyticsPayload,
  QuotaHistoryPayload,
  AnalyticsRange,
  TokenAnalyticsPayload,
  ToolAnalyticsPayload,
  ChangeAnalyticsPayload,
  NotificationStatusPayload,
  RemoteDevicePayload,
  PluginConfigEntryPayload,
  PluginConfigStatePayload,
} from "@/types";
import { isTauriRuntime } from "@/lib/tauri-runtime";

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauriRuntime()) {
    const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
    return tauriInvoke<T>(cmd, args);
  }
  throw new Error(`Command "${cmd}" is only available in Tauri runtime`);
}

interface McpServerUpsertParams {
  name: string;
  transport: McpTransport;
  enabled: boolean;
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  environment?: Record<string, string>;
}

interface CustomInstructionApplyParams {
  content: string;
  templateCode?: string;
  templateTitle?: string;
  source?: string;
}

export const api = {
  loadSnapshot: (localOnly = false) =>
    invoke<CoreEnvelope<CoreSnapshotPayload>>("load_snapshot", { localOnly }),

  loadBootstrapState: () =>
    invoke<CoreEnvelope<BootstrapStatePayload>>("load_bootstrap_state"),

  loadUsageAnalytics: (range?: AnalyticsRange | "year" | "all") =>
    invoke<CoreEnvelope<UsageAnalyticsPayload>>("load_usage_analytics", { range }),

  loadQuotaHistory: () =>
    invoke<CoreEnvelope<QuotaHistoryPayload>>("load_quota_history"),

  loadSessionAnalytics: (range?: AnalyticsRange | "year" | "all") =>
    invoke<CoreEnvelope<UsageAnalyticsPayload>>("load_session_analytics", { range }),

  loadTokenAnalytics: (range?: AnalyticsRange | "year" | "all") =>
    invoke<CoreEnvelope<TokenAnalyticsPayload>>("load_token_analytics", { range }),

  loadToolAnalytics: (range?: AnalyticsRange | "year" | "all") =>
    invoke<CoreEnvelope<ToolAnalyticsPayload>>("load_tool_analytics", { range }),

  loadChangeAnalytics: (range?: AnalyticsRange | "year" | "all") =>
    invoke<CoreEnvelope<ChangeAnalyticsPayload>>("load_change_analytics", { range }),

  clean: () =>
    invoke<CoreEnvelope<CleanPayload>>("clean"),

  rebuildRegistry: () =>
    invoke<CoreEnvelope<RebuildRegistryPayload>>("rebuild_registry"),

  setAutoSwitch: (enabled: boolean) =>
    invoke<CoreEnvelope<AutoSwitchConfigPayload>>("set_auto_switch", { enabled }),

  configureAutoSwitch: (threshold5hPercent?: number, thresholdWeeklyPercent?: number) =>
    invoke<CoreEnvelope<AutoSwitchConfigPayload>>("configure_auto_switch", {
      threshold5hPercent,
      thresholdWeeklyPercent,
    }),

  setApiProxyConfig: (mode: ApiProxyMode, url?: string) =>
    invoke<CoreEnvelope<ApiModePayload>>("set_api_proxy_config", { mode, url }),

  getUsageRefreshInterval: () =>
    invoke<string>("get_usage_refresh_interval"),

  setUsageRefreshInterval: (interval: string) =>
    invoke<string>("set_usage_refresh_interval", { interval }),

  testApiProxyConfig: (mode: ApiProxyMode, url?: string) =>
    invoke<CoreEnvelope<ApiProxyTestPayload>>("test_api_proxy_config", { mode, url }),

  detectApiProxyConfig: () =>
    invoke<CoreEnvelope<ApiProxyDetectPayload>>("detect_api_proxy_config"),

  checkUpdateInstallability: () =>
    invoke<UpdateInstallabilityPayload>("check_update_installability"),

  runDaemonOnce: () =>
    invoke<CoreEnvelope<DaemonRunPayload>>("run_daemon_once"),

  diagnose: () =>
    invoke<CoreEnvelope<DiagnosePayload>>("diagnose"),

  restartCodex: () =>
    invoke<void>("restart_codex"),

  gracefulRestartForUpdate: () =>
    invoke<void>("graceful_restart_for_update"),

  loadMcpServers: () =>
    invoke<CoreEnvelope<McpServerListPayload>>("load_mcp_servers"),

  loadPilotAccounts: () =>
    invoke<CoreEnvelope<PilotAccountsPayload>>("load_pilot_accounts"),

  loadPilotSessions: () =>
    invoke<CoreEnvelope<PilotSessionsPayload>>("load_pilot_sessions"),

  deleteSessions: (sessionPaths: string[]) =>
    invoke<CoreEnvelope<PilotSessionDeletePayload>>("delete_sessions", { sessionPaths }),

  recoverUnindexedSessions: () =>
    invoke<CoreEnvelope<PilotSessionRestorePayload>>("recover_unindexed_sessions"),

  previewAccountImport: (filePath: string) =>
    invoke<CoreEnvelope<AccountImportPreviewPayload>>("preview_account_import", { filePath }),

  importAccountsFromFile: (filePath: string, overwriteExisting = false) =>
    invoke<CoreEnvelope<AccountImportPayload>>("import_accounts_from_file", {
      filePath,
      overwriteExisting,
    }),

  exportAccountsToFile: (targetPath: string, includeApiKeys = true) =>
    invoke<CoreEnvelope<AccountExportPayload>>("export_accounts_to_file", {
      targetPath,
      includeApiKeys,
    }),

  switchAccount: (accountKey: string) =>
    invoke<CoreEnvelope<AccountSwitchPayload>>("switch_account", { accountKey }),

  switchAccountAndRestartCodex: (accountKey: string) =>
    invoke<CoreEnvelope<AccountSwitchPayload>>("switch_account_and_restart_codex", {
      accountKey,
    }),

  logout: () =>
    invoke<CoreEnvelope<AccountSwitchPayload>>("logout"),

  removeAccounts: (accountKeys: string[]) =>
    invoke<CoreEnvelope<AccountRemovePayload>>("remove_accounts", { accountKeys }),

  loadRelayState: () =>
    invoke<CoreEnvelope<RelayStatePayload>>("load_relay_state"),

  loadRouting: () =>
    invoke<CoreEnvelope<PilotRoutingPayload>>("load_routing"),

  upsertRelayProvider: (input: RelayUpsertInput) =>
    invoke<CoreEnvelope<RelayMutationPayload>>("upsert_relay_provider", { input }),

  deleteRelayProvider: (providerId: string) =>
    invoke<CoreEnvelope<RelayMutationPayload>>("delete_relay_provider", { providerId }),

  activateRelayProvider: (providerId: string) =>
    invoke<CoreEnvelope<RelayMutationPayload>>("activate_relay_provider", { providerId }),

  deactivateRelayProvider: (providerId: string) =>
    invoke<CoreEnvelope<RelayMutationPayload>>("deactivate_relay_provider", { providerId }),

  setRelayProviderNetwork: (providerId: string, network: string) =>
    invoke<CoreEnvelope<RelayMutationPayload>>("set_relay_provider_network", {
      providerId,
      network,
    }),

  setCodexRouterEnabled: (enabled: boolean) =>
    invoke<CoreEnvelope<RelayStatePayload>>("set_codex_router_enabled", { enabled }),

  testRelayProvider: (providerId: string) =>
    invoke<CoreEnvelope<RelayTestPayload>>("test_relay_provider", { providerId }),

  getRelayProxyStatus: () =>
    invoke<CoreEnvelope<RelayProxyState>>("get_relay_proxy_status"),

  diagnoseCodexRouter: () =>
    invoke<CoreEnvelope<RelayRouteDiagnosticPayload>>("diagnose_codex_router"),

  runCodexRouterDiagnostics: () =>
    invoke<CoreEnvelope<RelayRouteDiagnosticPayload>>("run_codex_router_diagnostics"),

  fixCodexRouterIssue: () =>
    invoke<CoreEnvelope<RelayRouteDiagnosticPayload>>("fix_codex_router_issue"),

  exportRelayConfig: () =>
    invoke<CoreEnvelope<RelayExportPayload>>("export_relay_config"),

  importRelayConfig: (filePath: string) =>
    invoke<CoreEnvelope<RelayImportPayload>>("import_relay_config", { filePath }),

  fetchRelayModelsDraft: (providerId: string) =>
    invoke<CoreEnvelope<RelayModelFetchPayload>>("fetch_relay_models_draft", { providerId }),

  fetchRelayModelsFromDraft: (input: RelayModelFetchDraftInput) =>
    invoke<CoreEnvelope<RelayModelFetchPayload>>("fetch_relay_models_from_draft", { input }),

  loadAdminContent: () =>
    invoke<CoreEnvelope<AdminContentPayload>>("load_admin_content"),

  saveAdminContent: (content: AdminContentFile) =>
    invoke<CoreEnvelope<AdminContentPayload>>("save_admin_content", { content }),

  submitTopbarFeedback: (text: string) =>
    invoke<CoreEnvelope<FeedbackSubmitPayload>>("submit_topbar_feedback", { text }),

  verifyMysteryCode: (code: string) =>
    invoke<CoreEnvelope<MysteryCodeVerifyPayload>>("verify_mystery_code", { code }),

  loadPluginState: () =>
    invoke<CoreEnvelope<PluginStatePayload>>("load_plugin_state"),

  loadNotificationStatus: () =>
    invoke<CoreEnvelope<NotificationStatusPayload>>("load_notification_status"),

  markNotificationRead: (id: string) =>
    invoke<CoreEnvelope<NotificationStatusPayload>>("mark_notification_read", { id }),

  markAllNotificationsRead: () =>
    invoke<CoreEnvelope<NotificationStatusPayload>>("mark_all_notifications_read"),

  dismissNotification: (id: string) =>
    invoke<CoreEnvelope<NotificationStatusPayload>>("dismiss_notification", { id }),

  loadRemoteDeviceState: () =>
    invoke<CoreEnvelope<RemoteDevicePayload>>("load_remote_device_state"),

  rotateRemoteDeviceKey: () =>
    invoke<CoreEnvelope<RemoteDevicePayload>>("rotate_remote_device_key"),

  loadPluginConfigState: () =>
    invoke<CoreEnvelope<PluginConfigStatePayload>>("load_plugin_config_state"),

  savePluginConfig: (
    pluginId: string,
    params: { enabled?: boolean; pinned?: boolean; config?: unknown },
  ) =>
    invoke<CoreEnvelope<PluginConfigEntryPayload>>("save_plugin_config", {
      pluginId,
      enabled: params.enabled,
      pinned: params.pinned,
      config: params.config,
    }),

  upsertMcpServer: (params: McpServerUpsertParams) =>
    invoke<CoreEnvelope<McpServerMutationPayload>>("upsert_mcp_server", {
      name: params.name,
      transport: params.transport,
      enabled: params.enabled,
      command: params.command,
      args: params.args ?? [],
      url: params.url,
      headers: params.headers ?? {},
      environment: params.environment ?? {},
    }),

  setMcpServerEnabled: (name: string, enabled: boolean) =>
    invoke<CoreEnvelope<McpServerMutationPayload>>("set_mcp_server_enabled", { name, enabled }),

  removeMcpServer: (name: string) =>
    invoke<CoreEnvelope<McpServerRemovePayload>>("remove_mcp_server", { name }),

  loadInstalledSkills: () =>
    invoke<CoreEnvelope<SkillListPayload>>("load_installed_skills"),

  loadSkillBackups: () =>
    invoke<CoreEnvelope<SkillBackupListPayload>>("load_skill_backups"),

  importSkill: (sourcePath: string) =>
    invoke<CoreEnvelope<SkillImportPayload>>("import_skill", { sourcePath }),

  removeSkill: (name: string) =>
    invoke<CoreEnvelope<SkillRemovePayload>>("remove_skill", { name }),

  restoreSkillBackup: (name: string) =>
    invoke<CoreEnvelope<SkillRestorePayload>>("restore_skill_backup", { name }),

  deleteSkillBackup: (name: string) =>
    invoke<CoreEnvelope<SkillDeleteBackupPayload>>("delete_skill_backup", { name }),

  loadCustomInstructionState: () =>
    invoke<CoreEnvelope<CustomInstructionStatePayload>>("load_custom_instruction_state"),

  previewCustomInstructionApply: (content: string) =>
    invoke<CoreEnvelope<CustomInstructionPreviewPayload>>("preview_custom_instruction_apply", {
      content,
    }),

  applyCustomInstruction: (params: CustomInstructionApplyParams) =>
    invoke<CoreEnvelope<CustomInstructionStatePayload>>("apply_custom_instruction", {
      content: params.content,
      templateCode: params.templateCode,
      templateTitle: params.templateTitle,
      source: params.source,
    }),

  clearCustomInstructionBlock: () =>
    invoke<CoreEnvelope<CustomInstructionStatePayload>>("clear_custom_instruction_block"),

  rollbackCustomInstruction: (historyId: string) =>
    invoke<CoreEnvelope<CustomInstructionStatePayload>>("rollback_custom_instruction", { historyId }),

  hasNotch: () =>
    invoke<boolean>("has_notch").catch(() => false),

  getHotspotEnabled: () =>
    invoke<boolean>("get_hotspot_enabled"),

  setHotspotEnabled: (enabled: boolean) =>
    invoke<boolean>("set_hotspot_enabled", { enabled }),

  focusMainWindow: () =>
    invoke<void>("focus_main_window"),

  hotspotReady: () =>
    invoke<void>("hotspot_ready"),

  openPath: (path: string) =>
    invoke<void>("open_path", { path }),

  getSystemInfo: () =>
    invoke<{ os: string; osVersion: string; arch: string; hostname: string }>("get_system_info"),
};
