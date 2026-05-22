import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Blocks, Copy, ExternalLink, FolderOpen, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format-time";
import { toast } from "@/hooks/use-toast";
import type { AdminPluginCatalogItem, InstalledPluginSummary } from "@/types";
import { Badge } from "@/components/ui/badge";
import { BentoCard } from "@/components/ui/bento-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SegmentedOptions } from "@/components/ui/segmented-options";
import { Skeleton } from "@/components/ui/skeleton";

type PluginTab = "installed" | "catalog";

export function PluginsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<PluginTab>("installed");
  const [keyword, setKeyword] = useState("");

  const query = useQuery({
    queryKey: ["plugin-state"],
    queryFn: () => api.loadPluginState(),
  });

  const payload = query.data?.data;
  const installed = payload?.installed ?? [];
  const catalog = payload?.catalog ?? [];
  const enabledCatalog = catalog.filter((item) => item.enabled);
  const normalizedKeyword = keyword.trim().toLowerCase();
  const filteredInstalled = useMemo(
    () =>
      installed.filter((item) => {
        if (!normalizedKeyword) return true;
        return [
          item.name,
          item.displayName,
          item.description ?? "",
          item.category ?? "",
          item.relativePath,
          item.capabilities.join(" "),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedKeyword);
      }),
    [installed, normalizedKeyword],
  );
  const filteredCatalog = useMemo(
    () =>
      catalog.filter((item) => {
        if (!normalizedKeyword) return true;
        return [item.name, item.displayName, item.description, item.category, item.sourceUrl ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(normalizedKeyword);
      }),
    [catalog, normalizedKeyword],
  );

  const copyPath = (path: string) => {
    navigator.clipboard.writeText(path);
    toast({
      title: t("plugins.pathCopied"),
      description: t("common.toastCopiedDesc"),
    });
  };

  const openUrl = (url: string) => {
    void import("@tauri-apps/plugin-shell")
      .then(({ open }) => open(url))
      .catch((err) => {
        toast({
          title: t("plugins.openFailed"),
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        });
      });
  };

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-xl text-xs leading-snug text-muted-foreground">
          {t("plugins.description")}
        </p>
        <div className="flex min-w-[280px] flex-1 items-center justify-end gap-1.5">
          <div className="relative w-full max-w-[260px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder={t("plugins.searchPlaceholder")}
              className="h-8 pl-8 text-xs"
            />
          </div>
          <SegmentedOptions
            items={[
              { value: "installed", label: t("plugins.installed") },
              { value: "catalog", label: t("plugins.catalog") },
            ]}
            value={tab}
            onChange={(value) => setTab(value as PluginTab)}
          />
          <Button size="sm" variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={query.isFetching ? "animate-spin" : ""} />
            {t("common.refresh")}
          </Button>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-4">
        <Metric label={t("plugins.installedCount")} value={installed.length} />
        <Metric label={t("plugins.catalogCount")} value={enabledCatalog.length} />
        <Metric
          label={t("plugins.skillsProvided")}
          value={installed.reduce((sum, item) => sum + item.skillCount, 0)}
        />
        <BentoCard compact>
          <span className="text-xs text-muted-foreground">{t("plugins.pluginRoot")}</span>
          <button
            type="button"
            className="mt-1 flex w-full items-center gap-1.5 text-left"
            title={payload?.pluginRootPath ?? ""}
            onClick={() => payload?.pluginRootPath && copyPath(payload.pluginRootPath)}
          >
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {payload?.pluginRootPath ?? "-"}
            </span>
            <Copy className="h-3 w-3 shrink-0 text-muted-foreground" />
          </button>
        </BentoCard>
      </div>

      {query.isLoading ? (
        <PluginSkeleton />
      ) : tab === "installed" ? (
        <InstalledPlugins
          items={filteredInstalled}
          onCopyPath={copyPath}
          onOpenPath={(path) => api.openPath(path)}
          onOpenUrl={openUrl}
        />
      ) : (
        <PluginCatalog items={filteredCatalog} onOpenUrl={openUrl} />
      )}

      <p className="text-[11px] text-muted-foreground">
        {payload?.lastScanAt ? t("plugins.lastScan", { time: formatDateTime(payload.lastScanAt) }) : ""}
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <BentoCard compact>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="mt-1 text-lg font-semibold">{value}</span>
    </BentoCard>
  );
}

function InstalledPlugins({
  items,
  onCopyPath,
  onOpenPath,
  onOpenUrl,
}: {
  items: InstalledPluginSummary[];
  onCopyPath: (path: string) => void;
  onOpenPath: (path: string) => void;
  onOpenUrl: (url: string) => void;
}) {
  const { t } = useTranslation();
  if (items.length === 0) {
    return <EmptyState text={t("plugins.emptyInstalled")} />;
  }

  return (
    <BentoCard className="p-0">
      <ScrollArea className="max-h-[calc(100vh-250px)]">
        <div className="divide-y divide-border">
          {items.map((item) => (
            <div key={item.id} className="grid gap-2 px-3.5 py-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Blocks className="h-4 w-4 text-primary" />
                  <span className="truncate text-sm font-semibold">{item.displayName}</span>
                  {item.version && <Badge variant="secondary">{item.version}</Badge>}
                  {item.category && <Badge variant="outline">{item.category}</Badge>}
                </div>
                <p className="mt-1 max-h-[34px] overflow-hidden text-xs leading-[17px] text-muted-foreground">
                  {item.description ?? t("plugins.noDescription")}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <TinyStat label={t("plugins.skillCountShort")} value={item.skillCount} />
                  <TinyStat label="MCP" value={item.mcpServerCount} />
                  {item.capabilities.slice(0, 4).map((capability) => (
                    <Badge key={capability} variant="secondary" className="font-normal">
                      {capability}
                    </Badge>
                  ))}
                </div>
                <button
                  type="button"
                  className="mt-2 max-w-full truncate font-mono text-[11px] text-muted-foreground hover:text-foreground"
                  title={item.manifestPath}
                  onClick={() => onCopyPath(item.manifestPath)}
                >
                  {item.relativePath}
                </button>
              </div>
              <div className="flex flex-wrap items-start justify-end gap-1.5">
                <Button size="sm" variant="outline" onClick={() => onOpenPath(item.directoryPath)}>
                  <FolderOpen />
                  {t("plugins.openFolder")}
                </Button>
                {item.homepage && (
                  <Button size="sm" variant="outline" onClick={() => onOpenUrl(item.homepage!)}>
                    <ExternalLink />
                    {t("plugins.homepage")}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </BentoCard>
  );
}

function PluginCatalog({
  items,
  onOpenUrl,
}: {
  items: AdminPluginCatalogItem[];
  onOpenUrl: (url: string) => void;
}) {
  const { t } = useTranslation();
  if (items.length === 0) {
    return <EmptyState text={t("plugins.emptyCatalog")} />;
  }

  return (
    <BentoCard className="p-0">
      <div className="divide-y divide-border">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "grid gap-2 px-3.5 py-3 md:grid-cols-[minmax(0,1fr)_auto]",
              !item.enabled && "opacity-55",
            )}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <span className="truncate text-sm font-semibold">{item.displayName}</span>
                <Badge variant={item.enabled ? "secondary" : "outline"}>
                  {item.enabled ? t("plugins.enabled") : t("plugins.disabled")}
                </Badge>
                <Badge variant="outline">{item.category}</Badge>
              </div>
              <p className="mt-1 max-h-[34px] overflow-hidden text-xs leading-[17px] text-muted-foreground">
                {item.description}
              </p>
              {item.installCommand && (
                <div className="mt-2 truncate rounded-[8px] border bg-muted/30 px-2 py-1 font-mono text-[11px] text-muted-foreground">
                  {item.installCommand}
                </div>
              )}
            </div>
            <div className="flex items-start justify-end gap-1.5">
              {item.sourceUrl && (
                <Button size="sm" variant="outline" onClick={() => onOpenUrl(item.sourceUrl!)}>
                  <ExternalLink />
                  {t("plugins.openSource")}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </BentoCard>
  );
}

function TinyStat({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded-full border bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground">
      {label}: {value}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <BentoCard className="flex min-h-[180px] items-center justify-center text-sm text-muted-foreground">
      {text}
    </BentoCard>
  );
}

function PluginSkeleton() {
  return (
    <BentoCard className="space-y-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </BentoCard>
  );
}
