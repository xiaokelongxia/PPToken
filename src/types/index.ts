export type UsageSource = "local" | "api";
export type ApiProxyMode = "direct" | "manual";
export type ApiReachabilityStatus = "unknown" | "reachable" | "unreachable";
export type AutoSwitchRuntimeState = "running" | "stopped" | "notInstalled" | "unknown";
export type McpTransport = "stdio" | "http" | "sse" | "unknown";
export type CustomInstructionProtectionState = "ready" | "unmanaged" | "protected";
export type CustomInstructionHistoryAction = "apply" | "clear" | "rollback";
export type VoiceTemplateKind = "dictation" | "task" | "review" | "translation" | "summary" | "custom";
export type VoiceVocabularyKind = "hotword" | "mapping";
export type VoiceSpeechModel = "appleSpeech" | "aliyunFunAsr" | "openai";
export type VoiceProcessingMode = "dictation" | "task" | "review" | "summary";
export type VoiceProcessingStatus = "completed" | "llm_error" | "llm_missing";
export type VoicePermissionState = "authorized" | "denied" | "restricted" | "notDetermined" | "unsupported";
export type VoiceCaptureState = "idle" | "starting" | "recording" | "stopping" | "error";
export type VoiceTriggerStyle = "hold" | "toggle";

export interface CoreWarning {
  code: string;
  message: string;
}

export interface AppPathState {
  codexHome: string;
  accountsPath: string;
  authPath: string;
  configPath: string;
  registryPath: string;
  sessionsPath: string;
  launchAgentPath: string;
  autoSwitchLogPath: string;
  authExists: boolean;
  configExists: boolean;
  registryExists: boolean;
  sessionsExists: boolean;
}

export interface AutoSwitchStatusPayload {
  enabled: boolean;
  threshold5hPercent: number;
  thresholdWeeklyPercent: number;
  serviceState: AutoSwitchRuntimeState;
  serviceLabel: string;
}

export interface ApiConfigPayload {
  proxy: ApiProxyConfigPayload;
}

export interface ApiProxyConfigPayload {
  mode: ApiProxyMode;
  url: string | null;
}

export interface ApiConnectivityPayload {
  usageStatus: ApiReachabilityStatus;
  usageLastError: string | null;
}

export interface UpdateInstallabilityPayload {
  canInstall: boolean;
  code: string;
  executablePath: string | null;
  bundlePath: string | null;
  translocated: boolean;
  quarantined: boolean;
}


export interface AppStatusPayload {
  paths: AppPathState;
  lastScanAt: number;
  usageSource: UsageSource;
  autoSwitch: AutoSwitchStatusPayload;
  api: ApiConfigPayload;
  apiConnectivity: ApiConnectivityPayload;
}

export interface CoreSnapshotPayload {
  status: AppStatusPayload;
}

export interface PilotAccountSummary {
  accountKey: string;
  email: string | null;
  alias: string | null;
  accountName: string | null;
  workspaceName: string | null;
  profileName: string | null;
  plan: string | null;
  authMode: string | null;
  active: boolean;
  snapshotPath: string;
  createdAt: number | null;
  lastUsedAt: number | null;
  lastUsageAt: number | null;
  hasApiKey: boolean;
  hasRefreshToken: boolean;
  hasActiveSubscription: boolean | null;
  subscriptionExpiresAt: number | null;
  subscriptionWillRenew: boolean | null;
  usageSource: UsageSource | null;
  primaryWindow: RateLimitWindow | null;
  secondaryWindow: RateLimitWindow | null;
  tokenStatus: string | null;
  relayProviderId: string | null;
  relayProviderName: string | null;
  relayProviderBaseUrl: string | null;
}

export interface PilotAccountsPayload {
  items: PilotAccountSummary[];
  total: number;
  activeAccountKey: string | null;
  sourcePath: string;
  lastScanAt: number;
}

export interface PilotSessionSummary {
  id: string;
  path: string;
  title: string | null;
  preview: string | null;
  source: string | null;
  cwd: string | null;
  originator: string | null;
  modelProvider: string | null;
  model: string | null;
  reasoningEffort: string | null;
  cliVersion: string | null;
  createdAt: string | null;
  createdAtEpoch: number | null;
  updatedAt: number | null;
  sizeBytes: number;
  turnCount: number;
  messageCount: number;
  eventCount: number;
  tokensUsed: number;
  archived: boolean;
  archivedAt: number | null;
  indexed: boolean;
  fileExists: boolean;
  gitBranch: string | null;
  gitOriginUrl: string | null;
  threadSource: string | null;
  agentRole: string | null;
  agentNickname: string | null;
}

export interface PilotSessionsPayload {
  items: PilotSessionSummary[];
  total: number;
  sourcePath: string;
  lastScanAt: number;
}

export interface PilotSessionDeletePayload {
  deletedPaths: string[];
  deletedCount: number;
  archivedCount: number;
  sourcePath: string;
}

export interface PilotSessionRestorePayload {
  restoredPaths: string[];
  restoredCount: number;
  sourcePath: string;
}

export interface PilotModelProviderSummary {
  id: string;
  name: string | null;
  baseUrl: string | null;
  wireApi: string | null;
  model: string | null;
  apiKeyEnv: string | null;
  apiKeyStored: boolean;
  requiresOpenaiAuth: boolean | null;
  hasApiKeyEnvConfig: boolean;
  network: string | null;
  enabled: boolean;
  healthScore: number | null;
  latencyMs: number | null;
  lastTestedAt: number | null;
  updatedAt: number | null;
  lastError: string | null;
  errorMessage: string | null;
  models: string[];
  extraHeaders: Record<string, string>;
}

export interface RateLimitWindow {
  usedPercent: number;
  remainingPercent: number;
  windowMinutes: number | null;
  resetsAt: number | null;
}

export interface AccountImportPreviewPayload {
  accountCount: number;
  accounts: PilotAccountSummary[];
  sourcePath: string;
}

export interface AccountImportPayload {
  importedAccountKeys: string[];
  registryAccountCount: number;
  sourcePath: string;
}

export interface AccountExportPayload {
  targetPath: string;
  accountCount: number;
}

export interface AccountSwitchPayload {
  switchedAccountKey: string;
  restartRequested: boolean;
}

export interface AccountRemovePayload {
  deletedIds: string[];
  deletedCount: number;
  registryAccountCount: number;
}

export interface RelayProxyState {
  running: boolean;
  port: number | null;
  codexBaseUrl: string | null;
}

export interface RelayProvider {
  id: string;
  name: string;
  ide: string;
  baseUrl: string;
  apiKey?: string | null;
  apiKeyStored: boolean;
  model: string;
  wireApi: string;
  extraHeaders: Record<string, string>;
  network: string;
  enabled: boolean;
  healthScore: number | null;
  latencyMs: number | null;
  lastTestedAt: number | null;
  createdAt: number;
  updatedAt: number;
  lastError: string | null;
  errorMessage: string | null;
  models: string[];
}

export interface RelayUpsertInput {
  id: string;
  name: string;
  ide?: string;
  baseUrl: string;
  apiKey?: string;
  model: string;
  wireApi: string;
  extraHeaders?: Record<string, string>;
  network?: string;
}

export interface RelayModelFetchDraftInput {
  baseUrl: string;
  apiKey?: string;
  wireApi: string;
  extraHeaders?: Record<string, string>;
}

export interface PilotRoutingPayload {
  codexRouterEnabled: boolean;
  activeProvider: string | null;
  activeModel: string | null;
  profileName: string | null;
  proxyRunning: boolean;
  proxyPort: number | null;
  statusMessage: string | null;
  providers: PilotModelProviderSummary[];
  sourcePath: string;
  lastScanAt: number;
}

export interface RelayStatePayload {
  codexRouterEnabled: boolean;
  activeByIde: Record<string, string>;
  proxy: RelayProxyState;
  providers: RelayProvider[];
  statePath: string;
  configPath: string;
  lastScanAt: number;
}

export interface RelayMutationPayload {
  state: RelayStatePayload;
  provider: RelayProvider | null;
}

export interface RelayTestPayload {
  providerId: string;
  reachable: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  message: string;
}

export interface RelayRouteDiagnosticPayload {
  routerEnabled: boolean;
  proxyRunning: boolean;
  proxyPort: number | null;
  activeProvider: string | null;
  activeModel: string | null;
  providerCount: number;
  catalogExists: boolean;
  configHasRouter: boolean;
  statePath: string;
  configPath: string;
  catalogPath: string;
  issues: string[];
  suggestions: string[];
}

export interface RelayModelFetchPayload {
  providerId: string;
  models: string[];
  endpoint: string;
  statusCode: number | null;
  message: string;
}

export interface RelayExportPayload {
  filePath: string;
  providerCount: number;
}

export interface RelayImportPayload {
  importedCount: number;
  skipped: string[];
  state: RelayStatePayload;
}

export interface CustomInstructionCurrentState {
  globalPath: string;
  fileExists: boolean;
  managedBlockPresent: boolean;
  protectionState: CustomInstructionProtectionState;
  issueMessage: string | null;
  managedContent: string;
  lastAppliedAt: number | null;
  lastTemplateCode: string | null;
  lastTemplateTitle: string | null;
}

export interface CustomInstructionHistoryEntry {
  id: string;
  createdAt: number;
  action: CustomInstructionHistoryAction;
  source: string;
  templateCode: string | null;
  templateTitle: string | null;
}

export interface CustomInstructionStatePayload {
  current: CustomInstructionCurrentState;
  history: CustomInstructionHistoryEntry[];
}

export interface CustomInstructionPreviewPayload {
  globalPath: string;
  protectionState: CustomInstructionProtectionState;
  issueMessage: string | null;
  currentManagedContent: string;
  nextManagedContent: string;
  resultingContent: string;
}

export interface VoicePromptTemplate {
  id: string;
  title: string;
  description: string;
  kind: VoiceTemplateKind;
  content: string;
  builtIn: boolean;
  updatedAt: number;
}

export interface VoiceVocabularyEntry {
  id: string;
  source: string;
  replacement: string;
  kind: VoiceVocabularyKind;
  appBundleId?: string | null;
  appName?: string | null;
  notes: string | null;
  updatedAt: number;
}

export interface VoiceVocabularyAppPayload {
  bundleId: string;
  name: string;
  path: string;
}

export interface VoiceHistoryEntry {
  id: string;
  templateId: string;
  templateTitle: string;
  templateKind: VoiceTemplateKind;
  promptContent?: string;
  rawText: string;
  renderedText: string;
  selectedText: string;
  clipboardText: string;
  targetBundleId?: string;
  targetAppName?: string;
  status?: VoiceProcessingStatus;
  processingError?: string | null;
  asrProvider?: string;
  asrModel?: string;
  asrLanguage?: string;
  asrEmotion?: string;
  asrDurationMs?: number | null;
  asrErrorCode?: string | null;
  createdAt: number;
}

export interface VoiceWorkspacePayload {
  templates: VoicePromptTemplate[];
  vocabulary: VoiceVocabularyEntry[];
  vocabularyApps?: VoiceVocabularyAppPayload[];
  history: VoiceHistoryEntry[];
  sourcePath: string;
  lastUpdatedAt: number;
}

export interface VoiceTemplateMutationPayload {
  workspace: VoiceWorkspacePayload;
  template: VoicePromptTemplate;
}

export interface VoiceVocabularyMutationPayload {
  workspace: VoiceWorkspacePayload;
  entry: VoiceVocabularyEntry;
}

export interface VoiceGeneratePayload {
  output: string;
  historyEntry: VoiceHistoryEntry;
  workspace: VoiceWorkspacePayload;
  processingStatus: VoiceProcessingStatus;
  processingError?: string | null;
}

export interface VoiceLlmConfigPayload {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  configured: boolean;
}

export interface VoiceAsrConfigPayload {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  configured: boolean;
}

export interface VoiceRuntimePermissionsPayload {
  microphone: VoicePermissionState;
  speechRecognition: VoicePermissionState;
  /**
   * macOS 辅助功能权限状态。用于合成 Cmd+V 把识别文本粘贴到前台应用的光标。
   * 非 macOS 恒为 `unsupported`；macOS 下只会是 `authorized` 或 `notDetermined`
   * （系统 API 无法区分「从未授权」与「被显式关闭」）。
   */
  accessibility: VoicePermissionState;
}

export interface VoiceRuntimeStatusPayload {
  supported: boolean;
  enabled: boolean;
  captureState: VoiceCaptureState;
  permissions: VoiceRuntimePermissionsPayload;
  globalShortcut: string;
  triggerKeyCode: number;
  triggerKeyLabel: string;
  triggerKeyKind: string;
  triggerStyle: VoiceTriggerStyle;
  /** 修饰键 mask（CGEventFlags 的 4 个语义位）；0 = 单键。旧版本无此字段时为 undefined。 */
  triggerModifierMask?: number;
  holdTriggerKeyCode: number;
  holdTriggerKeyLabel: string;
  holdTriggerKeyKind: string;
  holdTriggerModifierMask?: number;
  toggleTriggerKeyCode: number;
  toggleTriggerKeyLabel: string;
  toggleTriggerKeyKind: string;
  toggleTriggerModifierMask?: number;
  speechModel: VoiceSpeechModel;
  recognitionLanguage: string;
  processingMode: VoiceProcessingMode;
  processingModeId: string;
  sessionProcessingModeId?: string | null;
  perModeShortcuts: Record<
    string,
    {
      keyCode: number;
      keyLabel: string;
      keyKind: string;
      style: VoiceTriggerStyle;
      modifierMask?: number;
    }
  >;
  liveText: string;
  committedText: string;
  capturedSelectedText: string;
  capturedClipboardText: string;
  capturedTargetBundleId: string;
  capturedTargetAppName: string;
  activeAsrProvider: string;
  activeAsrModel: string;
  detectedAsrLanguage: string;
  detectedAsrEmotion: string;
  lastAsrDurationMs: number | null;
  lastAsrErrorCode: string | null;
  lastError: string | null;
  configPath: string;
  sidecarPath: string | null;
  autoInject: boolean;
}

export interface McpServerSummary {
  name: string;
  transport: McpTransport;
  enabled: boolean;
  sourcePath: string;
  command: string | null;
  args: string[];
  url: string | null;
  headers: Record<string, string>;
  environment: Record<string, string>;
}

export interface McpServerListPayload {
  items: McpServerSummary[];
  total: number;
  sourcePath: string;
  lastScanAt: number;
}

export interface McpServerMutationPayload {
  server: McpServerSummary;
  total: number;
  sourcePath: string;
}

export interface McpServerRemovePayload {
  removedName: string;
  total: number;
  sourcePath: string;
}

export interface InstalledSkillSummary {
  id: string;
  name: string;
  title: string | null;
  summary: string | null;
  relativePath: string;
  directoryPath: string;
  skillFilePath: string;
  updatedAt: number | null;
}

export interface SkillListPayload {
  items: InstalledSkillSummary[];
  total: number;
  rootPath: string;
  lastScanAt: number;
}

export interface SkillBackupSummary {
  id: string;
  skillID: string;
  name: string;
  title: string | null;
  relativePath: string;
  backupPath: string;
  createdAt: number;
}

export interface SkillBackupListPayload {
  items: SkillBackupSummary[];
  total: number;
  rootPath: string;
  lastScanAt: number;
}

export interface SkillImportPayload {
  skill: InstalledSkillSummary;
  replacedExisting: boolean;
  backup: SkillBackupSummary | null;
}

export interface SkillRemovePayload {
  removedSkillID: string;
  backup: SkillBackupSummary;
  remainingInstalledCount: number;
}

export interface SkillRestorePayload {
  restoredSkill: InstalledSkillSummary;
  backup: SkillBackupSummary;
  rollbackBackup: SkillBackupSummary | null;
}

export interface SkillDeleteBackupPayload {
  deletedBackupID: string;
  remainingBackupCount: number;
}

export interface AdminRelayStation {
  id: string;
  name: string;
  baseUrl: string;
  registerUrl: string;
  promoCode: string | null;
  description: string;
  placeholder: boolean;
  enabled: boolean;
  sortOrder: number;
}

export interface AdminPluginCatalogItem {
  id: string;
  name: string;
  displayName: string;
  description: string;
  category: string;
  version: string | null;
  sourceUrl: string | null;
  installCommand: string | null;
  enabled: boolean;
  sortOrder: number;
}

export interface AdminNotification {
  id: string;
  title: string;
  body: string;
  level: string;
  enabled: boolean;
  sortOrder: number;
}

export interface AdminMessage {
  id: string;
  title: string;
  body: string;
  actionLabel: string | null;
  actionUrl: string | null;
  qrText: string | null;
  enabled: boolean;
  sortOrder: number;
}

export interface AdminMysteryCode {
  id: string;
  code: string;
  title: string;
  message: string;
  enabled: boolean;
}

export interface AdminTopbarConfig {
  feedback: {
    title: string;
    description: string;
    placeholder: string;
    submitLabel: string;
  };
  mystery: {
    title: string;
    description: string;
    placeholder: string;
    verifyLabel: string;
    invalidTitle: string;
    invalidMessage: string;
    codes: AdminMysteryCode[];
  };
  notifications: AdminNotification[];
  messages: AdminMessage[];
}

export interface AdminFeedbackItem {
  id: string;
  text: string;
  status: string;
  createdAt: number;
}

export interface AdminContentFile {
  schemaVersion: number;
  relayStations: AdminRelayStation[];
  pluginCatalog: AdminPluginCatalogItem[];
  topbar: AdminTopbarConfig;
  feedbackItems: AdminFeedbackItem[];
  updatedAt: number;
}

export interface AdminContentPayload {
  content: AdminContentFile;
  sourcePath: string;
  updatedAt: number;
}

export interface FeedbackSubmitPayload {
  item: AdminFeedbackItem;
  total: number;
  sourcePath: string;
}

export interface MysteryCodeVerifyPayload {
  matched: boolean;
  title: string;
  message: string;
}

export interface InstalledPluginSummary {
  id: string;
  name: string;
  displayName: string;
  version: string | null;
  description: string | null;
  category: string | null;
  developerName: string | null;
  homepage: string | null;
  repository: string | null;
  capabilities: string[];
  skillCount: number;
  mcpServerCount: number;
  manifestPath: string;
  directoryPath: string;
  relativePath: string;
  updatedAt: number | null;
}

export interface PluginStatePayload {
  installed: InstalledPluginSummary[];
  catalog: AdminPluginCatalogItem[];
  pluginRootPath: string;
  sourcePath: string;
  lastScanAt: number;
}

export interface LocalNotificationItem {
  id: string;
  title: string;
  body: string;
  level: string;
  read: boolean;
  dismissed: boolean;
  sortOrder: number;
}

export interface NotificationStatusPayload {
  items: LocalNotificationItem[];
  unreadCount: number;
  sourcePath: string;
  lastScanAt: number;
}

export interface RemoteDevicePayload {
  deviceId: string;
  pairingKey: string;
  keyCreatedAt: number;
  keyRotatedAt: number | null;
  sourcePath: string;
}

export interface PluginConfigEntryPayload {
  pluginId: string;
  enabled: boolean;
  pinned: boolean;
  config: unknown;
  updatedAt: number;
}

export interface PluginConfigStatePayload {
  items: PluginConfigEntryPayload[];
  sourcePath: string;
  updatedAt: number;
}

export interface CleanPayload {
  authBackupsRemoved: number;
  registryBackupsRemoved: number;
  staleEntriesRemoved: number;
}

export interface RebuildRegistryPayload {
  accountCount: number;
  activeAccountKey: string | null;
  registryUpdated: boolean;
}

export interface AutoSwitchConfigPayload {
  autoSwitch: AutoSwitchStatusPayload;
}

export interface ApiModePayload {
  api: ApiConfigPayload;
}

export interface ApiProxyTestPayload {
  code: string;
  reachable: boolean;
  statusCode: number | null;
  message: string;
}

export interface ApiProxyDetectPayload {
  found: boolean;
  mode: ApiProxyMode | null;
  url: string | null;
  probe: ApiProxyTestPayload;
}

export interface DaemonRunPayload {
  executedAt: number;
  runOnce: boolean;
  autoSwitchEnabled: boolean;
  serviceState: AutoSwitchRuntimeState;
}

export interface DiagnosePayload {
  paths: AppPathState;
  coreVersion: string;
  platform: { os: string; arch: string };
  registryState: { accountCount: number };
  sessionState: { latestRolloutFound: boolean };
  apiState: {
    usageAttemptCount: number;
    usageSuccessCount: number;
    nameAttemptCount: number;
    nameSuccessCount: number;
    lastUsageFailure: string | null;
    lastUsageFailureAccount: string | null;
    lastNameFailure: string | null;
    lastNameFailureAccount: string | null;
  };
}

export interface CoreEnvelope<T> {
  schemaVersion: number;
  success: boolean;
  code: string;
  message: string;
  warnings: CoreWarning[];
  data: T;
}

export interface BootstrapStatePayload {
  writtenAt: number | null;
  snapshotProgressive: CoreSnapshotPayload | null;
  usageAnalytics: UsageAnalyticsPayload | null;
  mcpServers: McpServerListPayload | null;
  installedSkills: SkillListPayload | null;
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export interface DailyActivity {
  date: string;
  sessionCount: number;
  totalFileSize: number;
  activityLevel: number;
}

export interface TodaySummary {
  sessionCount: number;
  totalFileSize: number;
  activeMinutesEstimate: number;
}

export interface SessionStats {
  totalSessions: number;
  totalSizeBytes: number;
  activeDays: number;
  avgSessionsPerActiveDay: number;
  mostActiveDate: string | null;
  mostActiveCount: number;
}

export interface UsageAnalyticsPayload {
  today: TodaySummary;
  sessionStats: SessionStats;
  dailyActivity: DailyActivity[];
}

export interface QuotaHistoryPoint {
  timestamp: number;
  accountKey: string;
  primaryUsedPercent: number | null;
  secondaryUsedPercent: number | null;
}

export interface QuotaHistoryPayload {
  points: QuotaHistoryPoint[];
}

// ---------------------------------------------------------------------------
// Session analytics (new 4 endpoints)
// ---------------------------------------------------------------------------

export type AnalyticsRange = "today" | "week" | "month";

export interface TokenDaySeries {
  date: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  cumulative: number;
}

export interface TokenAnalyticsPayload {
  totalTokens: number;
  avgPerSession: number;
  inputPct: number;
  outputPct: number;
  reasoningPct: number;
  inputTotal: number;
  outputTotal: number;
  reasoningTotal: number;
  series: TokenDaySeries[];
}

export interface ToolRankItem {
  name: string;
  count: number;
}

export interface ToolAnalyticsPayload {
  totalCalls: number;
  distinctCount: number;
  searchCount: number;
  editCount: number;
  topTools: ToolRankItem[];
}

export interface ChangeDaySeries {
  date: string;
  commands: number;
  writeOps: number;
  readOps: number;
}

export interface ChangeAnalyticsPayload {
  totalCommands: number;
  writeCommands: number;
  readCommands: number;
  otherCommands: number;
  series: ChangeDaySeries[];
}
