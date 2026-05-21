import { useState, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  CheckCircle2,
  FolderOpen,
  KeyRound,
  MessageSquare,
  RefreshCw,
  Server,
  Sparkles,
  Wifi,
  WifiOff,
} from "lucide-react";

import { ApiProxyDialog } from "@/components/runtime/api-proxy-dialog";
import { Badge } from "@/components/ui/badge";
import { BentoCard } from "@/components/ui/bento-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatDuration } from "@/lib/format-time";
import { cn } from "@/lib/utils";
import type {
  ApiReachabilityStatus,
  AppPathState,
  DailyActivity,
  PilotAccountSummary,
  PilotSessionSummary,
} from "@/types";
import type { Route } from "@/types/navigation";
import { formatBytes } from "@/components/pilot/pilot-ui";

const RUNTIME_STATE_DISPLAY_QUERY_KEY = ["runtime-state", "display"] as const;
const BOOTSTRAP_STATE_QUERY_KEY = ["bootstrap-state", "overview"] as const;

type TrendTab = "activity" | "sessions" | "token" | "tools" | "changes" | "quota";
type TrendRange = "week" | "month" | "year";

interface OverviewPageProps {
  onNavigate?: (route: Route) => void;
}

export function OverviewPage({ onNavigate }: OverviewPageProps) {
  const { t } = useTranslation();
  const [proxyDialogOpen, setProxyDialogOpen] = useState(false);
  const [trendTab, setTrendTab] = useState<TrendTab>("activity");
  const [trendRange, setTrendRange] = useState<TrendRange>("week");

  const snapshotQuery = useQuery({
    queryKey: RUNTIME_STATE_DISPLAY_QUERY_KEY,
    queryFn: () => api.loadSnapshot(false),
    refetchOnWindowFocus: false,
  });
  const bootstrapQuery = useQuery({
    queryKey: BOOTSTRAP_STATE_QUERY_KEY,
    queryFn: () => api.loadBootstrapState(),
    refetchOnWindowFocus: false,
  });
  const accountsQuery = useQuery({
    queryKey: ["pilot", "accounts", "overview"],
    queryFn: () => api.loadPilotAccounts(),
    refetchOnWindowFocus: false,
  });
  const sessionsQuery = useQuery({
    queryKey: ["pilot", "sessions", "overview"],
    queryFn: () => api.loadPilotSessions(),
    refetchOnWindowFocus: false,
  });
  const mcpQuery = useQuery({
    queryKey: ["mcp-servers", "overview"],
    queryFn: () => api.loadMcpServers(),
    refetchOnWindowFocus: false,
  });
  const skillsQuery = useQuery({
    queryKey: ["installed-skills", "overview"],
    queryFn: () => api.loadInstalledSkills(),
    refetchOnWindowFocus: false,
  });

  const status = snapshotQuery.data?.data.status;

  if (snapshotQuery.isLoading) {
    return <OverviewSkeleton />;
  }

  if (snapshotQuery.isError || !status) {
    return (
      <div className="flex min-h-[360px] items-center justify-center p-6">
        <BentoCard className="w-full max-w-md text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
          <h2 className="mt-3 text-sm font-semibold">{t("common.error")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {snapshotQuery.error instanceof Error
              ? snapshotQuery.error.message
              : t("common.toastErrorGenericDesc")}
          </p>
          <Button
            size="sm"
            className="mt-4"
            onClick={() => snapshotQuery.refetch()}
          >
            <RefreshCw />
            {t("common.retry")}
          </Button>
        </BentoCard>
      </div>
    );
  }

  const analytics = bootstrapQuery.data?.data.usageAnalytics ?? null;
  const accounts = accountsQuery.data?.data.items ?? [];
  const activeAccount = accounts.find((account) => account.active) ?? null;
  const sessions = sessionsQuery.data?.data.items ?? [];
  const mcpServers =
    mcpQuery.data?.data.items ?? bootstrapQuery.data?.data.mcpServers?.items ?? [];
  const installedSkills =
    skillsQuery.data?.data.items ?? bootstrapQuery.data?.data.installedSkills?.items ?? [];
  const healthItems = buildHealthItems(status.paths, t);
  const healthOk = healthItems.every((item) => item.ok);
  const apiState = getApiState(status.apiConnectivity.usageStatus, t);
  const sessionActivity = buildDailyActivityFromSessions(sessions);
  const activitySource = analytics?.dailyActivity?.length
    ? analytics.dailyActivity
    : sessionActivity;
  const activity = activitySource
    ? [...activitySource].sort((a, b) => a.date.localeCompare(b.date))
    : [];
  const heatmapDays = buildHeatmapDays(activity, trendRange);
  const totalSessionSize =
    sessions.reduce((sum, session) => sum + session.sizeBytes, 0) ||
    analytics?.sessionStats.totalSizeBytes ||
    0;
  const todayActivity = activity.find((day) => day.date === dateKey(startOfDay(new Date())));
  const todayActiveMinutes =
    analytics?.today.activeMinutesEstimate ??
    estimateActiveMinutesFromActivity(todayActivity);
  const weekActiveDays = countRecentActiveDays(activity, 7);
  const monthActiveDays = countRecentActiveDays(activity, 31);
  const mcpEnabledCount = mcpServers.filter((server) => server.enabled).length;

  const refetchOverview = () => {
    void snapshotQuery.refetch();
    void bootstrapQuery.refetch();
    void accountsQuery.refetch();
    void sessionsQuery.refetch();
    void mcpQuery.refetch();
    void skillsQuery.refetch();
  };

  return (
    <div className="space-y-2.5">
      <div className="grid gap-2 md:grid-cols-4">
        <OfficialStatCard
          icon={KeyRound}
          label={t("overview.officialAccounts")}
          value={String(accountsQuery.data?.data.total ?? accounts.length)}
          detail={activeAccount ? accountLabel(activeAccount) : t("overview.noAccount")}
          tone="blue"
        />
        <OfficialStatCard
          icon={MessageSquare}
          label={t("overview.officialSessions")}
          value={String(sessionsQuery.data?.data.total ?? analytics?.sessionStats.totalSessions ?? sessions.length)}
          detail={totalSessionSize > 0 ? formatBytes(totalSessionSize) : "—"}
          tone="emerald"
        />
        <OfficialStatCard
          icon={Server}
          label={t("overview.officialMcp")}
          value={String(mcpQuery.data?.data.total ?? mcpServers.length)}
          detail={mcpServers.length > 0 ? t("overview.enabledCountShort", { count: mcpEnabledCount }) : "—"}
          tone="violet"
        />
        <OfficialStatCard
          icon={Sparkles}
          label={t("overview.officialSkills")}
          value={String(skillsQuery.data?.data.total ?? installedSkills.length)}
          detail="—"
          tone="amber"
        />
      </div>

      <div className="grid items-start gap-2 lg:grid-cols-[minmax(0,0.95fr)_minmax(230px,0.5fr)_minmax(0,1.05fr)]">
        <BentoCard className="p-0">
          <div className="flex flex-col gap-2 border-b px-3 py-2.5 2xl:flex-row 2xl:items-start 2xl:justify-between">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">{t("overview.currentActiveAccount")}</h2>
              <p className="truncate text-lg font-semibold tracking-normal">
                {activeAccount ? accountLabel(activeAccount) : t("overview.noActiveAccount")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setProxyDialogOpen(true)}
              >
                {t("overview.configureProxy")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={refetchOverview}
                disabled={
                  snapshotQuery.isFetching ||
                  bootstrapQuery.isFetching ||
                  accountsQuery.isFetching ||
                  sessionsQuery.isFetching
                }
              >
                <RefreshCw
                  className={cn(
                    (snapshotQuery.isFetching ||
                      bootstrapQuery.isFetching ||
                      accountsQuery.isFetching ||
                      sessionsQuery.isFetching) &&
                      "animate-spin",
                  )}
                />
                {t("common.refresh")}
              </Button>
              <span className="text-xs text-muted-foreground">{apiState.value}</span>
            </div>
          </div>

          <div className="grid gap-2 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <QuotaSummaryCard
              label={t("overview.primaryQuota")}
              value={formatQuotaValue(activeAccount?.primaryWindow?.remainingPercent)}
            />
            <QuotaSummaryCard
              label={t("overview.weeklyQuota")}
              value={formatQuotaValue(activeAccount?.secondaryWindow?.remainingPercent)}
            />
            <Button
              className="h-full min-h-[48px] px-4"
              onClick={() => onNavigate?.("accounts")}
            >
              {t("accounts.addAccount")}
            </Button>
          </div>
        </BentoCard>

        <BentoCard className="p-0">
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
            <h2 className="text-sm font-semibold">{t("overview.healthTitle")}</h2>
            <Badge
              variant={healthOk ? "secondary" : "destructive"}
              className="font-normal"
            >
              {healthOk ? t("overview.healthOk") : t("overview.healthMissing")}
            </Badge>
          </div>
          <div className="divide-y">
            {healthItems.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between gap-2 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  {item.ok ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
                  )}
                  <span className="truncate text-[13px] font-medium">{item.label}</span>
                </div>
                <span
                  className={cn(
                    "shrink-0 text-xs",
                    item.ok ? "text-emerald-600" : "text-amber-600",
                  )}
                >
                  {item.ok ? t("overview.healthOk") : t("overview.healthMissing")}
                </span>
              </div>
            ))}
          </div>
          <div className="px-3 pb-3 pt-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => api.openPath(status.paths.codexHome)}
            >
              <FolderOpen />
              {t("overview.openCodexFolder")}
            </Button>
          </div>
        </BentoCard>

        <BentoCard className="p-0">
          <div className="flex flex-col gap-2 border-b px-3 py-2.5 2xl:flex-row 2xl:items-center 2xl:justify-between">
            <div className="flex flex-wrap gap-1.5">
              {TREND_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  className={cn(
                    "h-7 rounded-[8px] px-2.5 text-xs font-medium transition-colors",
                    trendTab === tab.value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  onClick={() => setTrendTab(tab.value)}
                >
                  {t(tab.labelKey)}
                </button>
              ))}
            </div>
            <div className="flex w-fit rounded-[8px] border bg-muted/30 p-1">
              {TREND_RANGES.map((range) => (
                <button
                  key={range.value}
                  type="button"
                  className={cn(
                    "h-6 rounded-[6px] px-2.5 text-xs font-medium transition-colors",
                    trendRange === range.value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setTrendRange(range.value)}
                >
                  {t(range.labelKey)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 p-3">
            <h2 className="text-sm font-semibold">{t(trendTitleKey(trendTab))}</h2>
            <CalendarHeatmap days={heatmapDays} />
            <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-1 2xl:grid-cols-3">
              <TrendMetric
                label={t("overview.todayActive")}
                value={analytics ? formatDuration(todayActiveMinutes) : "—"}
              />
              <TrendMetric
                label={t("overview.weekActiveDays")}
                value={t("overview.daysValue", { count: weekActiveDays })}
              />
              <TrendMetric
                label={t("overview.monthActiveDays")}
                value={t("overview.daysValue", { count: monthActiveDays })}
              />
            </div>
          </div>
        </BentoCard>
      </div>

      <ApiProxyDialog
        open={proxyDialogOpen}
        onOpenChange={setProxyDialogOpen}
        currentProxy={status.api.proxy}
        onSaved={refetchOverview}
      />
    </div>
  );
}

const TREND_TABS: Array<{ value: TrendTab; labelKey: string }> = [
  { value: "activity", labelKey: "overview.tabActivity" },
  { value: "sessions", labelKey: "overview.tabSessions" },
  { value: "token", labelKey: "overview.tabToken" },
  { value: "tools", labelKey: "overview.tabTools" },
  { value: "changes", labelKey: "overview.tabChanges" },
  { value: "quota", labelKey: "overview.tabQuota" },
];

const TREND_RANGES: Array<{ value: TrendRange; labelKey: string }> = [
  { value: "week", labelKey: "overview.rangeThisWeek" },
  { value: "month", labelKey: "overview.rangeThisMonth" },
  { value: "year", labelKey: "overview.rangeYear" },
];

function OfficialStatCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail: string;
  tone: "blue" | "emerald" | "violet" | "amber";
}) {
  const toneClass = {
    blue: {
      bar: "from-sky-500 to-blue-500",
      icon: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    },
    emerald: {
      bar: "from-emerald-500 to-teal-500",
      icon: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
    violet: {
      bar: "from-violet-500 to-fuchsia-500",
      icon: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    },
    amber: {
      bar: "from-amber-500 to-orange-500",
      icon: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    },
  }[tone];

  return (
    <BentoCard compact className="relative min-h-[82px] overflow-hidden">
      <div className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", toneClass.bar)} />
      <div className="flex h-full flex-col justify-between gap-2 pt-1">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <div className={cn("flex h-7 w-7 items-center justify-center rounded-[8px]", toneClass.icon)}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-xl font-semibold tracking-normal">{value}</div>
          <div className="truncate text-xs text-muted-foreground" title={detail}>
            {detail}
          </div>
        </div>
      </div>
    </BentoCard>
  );
}

function QuotaSummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border bg-muted/20 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tracking-normal">{value}</div>
    </div>
  );
}

function CalendarHeatmap({ days }: { days: HeatmapDay[] }) {
  const { t } = useTranslation();
  const firstMonth = formatMonthLabel(days[0]?.date);
  const middleMonth = formatMonthLabel(days[Math.floor(days.length / 2)]?.date);
  const lastMonth = formatMonthLabel(days[days.length - 1]?.date);

  return (
    <div className="space-y-2">
      <div className="flex justify-between px-1 text-[11px] text-muted-foreground">
        <span>{firstMonth}</span>
        <span>{middleMonth}</span>
        <span>{lastMonth}</span>
      </div>
      <div className="overflow-x-auto pb-1">
        <div
          className="grid w-max grid-flow-col grid-rows-7 gap-[3px]"
          style={{ gridTemplateRows: "repeat(7, 9px)" }}
        >
          {days.map((day) => (
            <div
              key={day.date}
              title={`${day.date}: ${day.count}`}
              className={cn("h-[9px] w-[9px] rounded-[2px]", heatmapColor(day.level))}
            />
          ))}
        </div>
      </div>
      <div className="flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
        <span>{t("overview.less")}</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <span key={level} className={cn("h-[10px] w-[10px] rounded-[2px]", heatmapColor(level))} />
        ))}
        <span>{t("overview.more")}</span>
      </div>
    </div>
  );
}

function TrendMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border bg-muted/20 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-base font-semibold tracking-normal">{value}</div>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-2.5">
      <div className="grid gap-2 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <BentoCard key={index} compact className="min-h-[82px]">
            <Skeleton className="h-4 w-24" />
            <div className="mt-auto space-y-2">
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-3 w-32" />
            </div>
          </BentoCard>
        ))}
      </div>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
        <BentoCard>
          <Skeleton className="h-8 w-48" />
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        </BentoCard>
        <BentoCard>
          <Skeleton className="h-8 w-40" />
          <div className="mt-4 space-y-3">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        </BentoCard>
      </div>
      <BentoCard>
        <Skeleton className="h-8 w-72" />
        <Skeleton className="mt-5 h-40" />
      </BentoCard>
    </div>
  );
}

function buildHealthItems(paths: AppPathState, t: (key: string) => string) {
  return [
    {
      label: t("overview.healthCodexHome"),
      path: paths.codexHome,
      ok: true,
    },
    {
      label: t("overview.healthAuth"),
      path: paths.authPath,
      ok: paths.authExists,
    },
    {
      label: t("overview.healthRegistry"),
      path: paths.registryPath,
      ok: paths.registryExists,
    },
  ];
}

function getApiState(
  status: ApiReachabilityStatus,
  t: (key: string) => string,
): {
  icon: typeof Wifi;
  label: string;
  value: string;
} {
  if (status === "reachable") {
    return {
      icon: Wifi,
      label: t("overview.apiReachable"),
      value: t("overview.apiReachable"),
    };
  }
  if (status === "unreachable") {
    return {
      icon: WifiOff,
      label: t("overview.apiUnreachable"),
      value: t("overview.apiUnreachable"),
    };
  }
  return {
    icon: Wifi,
    label: t("overview.apiChecking"),
    value: t("overview.apiChecking"),
  };
}

function accountLabel(account: PilotAccountSummary) {
  if (account.hasApiKey) return "API Key";
  return account.alias || account.email || account.accountName || account.workspaceName || account.accountKey;
}

function formatQuotaValue(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(value)}%`;
}

interface HeatmapDay {
  date: string;
  count: number;
  level: number;
}

function buildHeatmapDays(activity: DailyActivity[], range: TrendRange): HeatmapDay[] {
  const dayCount = range === "year" ? 371 : 98;
  const activityByDate = new Map(activity.map((day) => [day.date, day]));
  const end = startOfDay(new Date());
  const days: HeatmapDay[] = [];

  for (let index = dayCount - 1; index >= 0; index -= 1) {
    const date = new Date(end);
    date.setDate(end.getDate() - index);
    const key = dateKey(date);
    const activeDay = activityByDate.get(key);
    days.push({
      date: key,
      count: activeDay?.sessionCount ?? 0,
      level: activeDay?.activityLevel ?? 0,
    });
  }

  while (days.length % 7 !== 0) {
    const first = new Date(`${days[0]?.date ?? dateKey(end)}T00:00:00`);
    first.setDate(first.getDate() - 1);
    days.unshift({ date: dateKey(first), count: 0, level: 0 });
  }

  return days;
}

function buildDailyActivityFromSessions(sessions: PilotSessionSummary[]): DailyActivity[] {
  const byDate = new Map<string, { sessionCount: number; totalFileSize: number }>();
  for (const session of sessions) {
    const timestamp = session.updatedAt ?? parseIsoToEpochSec(session.createdAt);
    if (!timestamp) continue;
    const date = dateKey(new Date(timestamp * 1000));
    const current = byDate.get(date) ?? { sessionCount: 0, totalFileSize: 0 };
    current.sessionCount += 1;
    current.totalFileSize += session.sizeBytes;
    byDate.set(date, current);
  }

  return [...byDate.entries()].map(([date, value]) => ({
    date,
    sessionCount: value.sessionCount,
    totalFileSize: value.totalFileSize,
    activityLevel: Math.min(4, Math.max(1, Math.ceil(value.sessionCount / 2))),
  }));
}

function countRecentActiveDays(activity: DailyActivity[], dayCount: number) {
  const cutoff = startOfDay(new Date());
  cutoff.setDate(cutoff.getDate() - dayCount + 1);
  return activity.filter((day) => {
    const date = new Date(`${day.date}T00:00:00`);
    return date >= cutoff && day.sessionCount > 0;
  }).length;
}

function estimateActiveMinutesFromActivity(day?: DailyActivity) {
  if (!day) return 0;
  return Math.max(day.sessionCount * 3, Math.min(240, day.activityLevel * 12));
}

function parseIsoToEpochSec(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMonthLabel(date?: string) {
  if (!date) return "";
  const [, month] = date.split("-");
  return month ? `${Number(month)}月` : date;
}

function heatmapColor(level: number) {
  if (level >= 4) return "bg-emerald-600";
  if (level === 3) return "bg-emerald-500";
  if (level === 2) return "bg-emerald-300";
  if (level === 1) return "bg-emerald-100 dark:bg-emerald-900/60";
  return "bg-muted";
}

function trendTitleKey(tab: TrendTab) {
  switch (tab) {
    case "sessions":
      return "overview.sessionsTrendTitle";
    case "token":
      return "overview.tokenTrendTitle";
    case "tools":
      return "overview.toolsTrendTitle";
    case "changes":
      return "overview.changesTrendTitle";
    case "quota":
      return "overview.quotaTrendTitle";
    case "activity":
    default:
      return "overview.codexActivityTrend";
  }
}
