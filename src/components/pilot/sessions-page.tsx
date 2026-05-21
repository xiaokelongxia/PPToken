import { Fragment, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArchiveRestore,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Clock3,
  Database,
  FolderOpen,
  Loader2,
  Layers3,
  MessagesSquare,
  Search,
  Split,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { api } from "@/lib/api";
import { formatDateTime, formatDateTimeMaybe } from "@/lib/format-time";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { PilotSessionSummary } from "@/types";
import { Badge } from "@/components/ui/badge";
import { BentoCard } from "@/components/ui/bento-card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PilotPageHeader, PilotTableSkeleton, formatBytes } from "@/components/pilot/pilot-ui";

export function SessionsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<PilotSessionSummary | null>(null);
  const [bulkDeletePaths, setBulkDeletePaths] = useState<string[]>([]);
  const [detailTarget, setDetailTarget] = useState<PilotSessionSummary | null>(null);
  const [recoverConfirmOpen, setRecoverConfirmOpen] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(() => new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set(["__root__"]));
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "all" | "archived" | "missing">("active");

  const query = useQuery({
    queryKey: ["pilot", "sessions"],
    queryFn: () => api.loadPilotSessions(),
  });
  const payload = query.data?.data;
  const sessions = payload?.items ?? [];
  const totalSize = useMemo(
    () => sessions.reduce((sum, session) => sum + session.sizeBytes, 0),
    [sessions],
  );
  const totalTurns = useMemo(
    () => sessions.reduce((sum, session) => sum + session.turnCount, 0),
    [sessions],
  );
  const totalMessages = useMemo(
    () => sessions.reduce((sum, session) => sum + session.messageCount, 0),
    [sessions],
  );
  const latestUpdated = sessions
    .map((session) => session.updatedAt ?? 0)
    .reduce((latest, next) => Math.max(latest, next), 0);
  const filteredSessions = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return sessions.filter((session) => {
      if (statusFilter === "active" && session.archived) return false;
      if (statusFilter === "archived" && !session.archived) return false;
      if (statusFilter === "missing" && session.fileExists) return false;
      if (!keyword) return true;
      return [
        session.id,
        session.title,
        session.preview,
        session.cwd,
        session.originator,
        session.source,
        session.modelProvider,
        session.model,
        session.gitBranch,
        session.gitOriginUrl,
        session.cliVersion,
        session.path,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword));
    });
  }, [searchText, sessions, statusFilter]);
  const sessionGroups = useMemo(() => groupSessionsByWorkspace(filteredSessions), [filteredSessions]);
  const missingFileCount = useMemo(
    () => sessions.filter((session) => !session.fileExists).length,
    [sessions],
  );
  const archivedCount = useMemo(() => sessions.filter((session) => session.archived).length, [sessions]);
  const indexedCount = useMemo(() => sessions.filter((session) => session.indexed).length, [sessions]);
  const totalTokens = useMemo(
    () => sessions.reduce((sum, session) => sum + (session.tokensUsed || 0), 0),
    [sessions],
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["pilot", "sessions"] });
    queryClient.invalidateQueries({ queryKey: ["snapshot"] });
  };

  const deleteMutation = useMutation({
    mutationFn: (sessionPath: string) => api.deleteSessions([sessionPath]),
    onSuccess: (res) => {
      setDeleteTarget(null);
      invalidate();
      toast({
        title: t("sessions.deleteDone"),
        description: t("sessions.deleteDoneDesc", {
          count: res.data.deletedCount,
          archived: res.data.archivedCount,
        }),
      });
    },
    onError: (err) => toastError(t("sessions.deleteFailed"), err),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (sessionPaths: string[]) => api.deleteSessions(sessionPaths),
    onSuccess: (res) => {
      setBulkDeletePaths([]);
      setSelectedPaths(new Set());
      invalidate();
      toast({
        title: t("sessions.deleteDone"),
        description: t("sessions.deleteDoneDesc", {
          count: res.data.deletedCount,
          archived: res.data.archivedCount,
        }),
      });
    },
    onError: (err) => toastError(t("sessions.deleteFailed"), err),
  });

  const recoverMutation = useMutation({
    mutationFn: () => api.recoverUnindexedSessions(),
    onSuccess: (res) => {
      invalidate();
      toast({
        title: t("sessions.recoverDone"),
        description: t("sessions.recoverDoneDesc", { count: res.data.restoredCount }),
      });
    },
    onError: (err) => toastError(t("sessions.recoverFailed"), err),
  });

  const busy =
    query.isFetching ||
    deleteMutation.isPending ||
    bulkDeleteMutation.isPending ||
    recoverMutation.isPending;
  const selectedCount = selectedPaths.size;
  const toggleGroup = (key: string) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };
  const toggleSession = (path: string, checked: boolean) => {
    setSelectedPaths((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(path);
      } else {
        next.delete(path);
      }
      return next;
    });
  };
  const toggleGroupSelection = (paths: string[], checked: boolean) => {
    setSelectedPaths((current) => {
      const next = new Set(current);
      for (const path of paths) {
        if (checked) {
          next.add(path);
        } else {
          next.delete(path);
        }
      }
      return next;
    });
  };
  const requestBulkDelete = () => {
    setBulkDeletePaths(Array.from(selectedPaths));
  };
  const requestRecover = () => {
    setRecoverConfirmOpen(true);
  };
  const expandAllGroups = () => {
    setExpandedGroups(new Set(sessionGroups.map((group) => group.key)));
  };
  const collapseAllGroups = () => {
    setExpandedGroups(new Set());
  };

  return (
    <div>
      <div className="mb-2 flex flex-col gap-1.5 xl:flex-row xl:items-start xl:justify-between">
        <PilotPageHeader
          description={t("pilot.sessionsDesc")}
          source={payload?.sourcePath}
          refreshing={query.isFetching}
          onRefresh={() => query.refetch()}
        />
        <div className="flex shrink-0 flex-wrap gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={requestRecover}
            disabled={busy}
          >
            {recoverMutation.isPending ? <Loader2 className="animate-spin" /> : <ArchiveRestore />}
            {t("sessions.recover")}
          </Button>
        </div>
      </div>

      <div className="mb-2 grid gap-2 md:grid-cols-5">
        <SessionMetricCard
          icon={<MessagesSquare className="h-4 w-4" />}
          label={t("sessions.totalSessions")}
          value={String(payload?.total ?? sessions.length)}
          detail={payload?.sourcePath}
          tone="ok"
        />
        <SessionMetricCard
          icon={<Database className="h-4 w-4" />}
          label={t("sessions.indexedThreads")}
          value={String(indexedCount)}
          detail={t("sessions.archivedThreads", { count: archivedCount })}
          tone="ok"
        />
        <SessionMetricCard
          icon={<Clock3 className="h-4 w-4" />}
          label={t("sessions.recentUpdate")}
          value={latestUpdated > 0 ? formatDateTime(latestUpdated) : "-"}
          tone={latestUpdated > 0 ? "ok" : "muted"}
        />
        <SessionMetricCard
          icon={<Layers3 className="h-4 w-4" />}
          label={t("sessions.branchNodes")}
          value={compactNumber(totalTokens)}
          detail={`${t("sessions.turnCount", { count: totalTurns })} · ${t("sessions.messageCount", { count: totalMessages })}`}
          tone={totalTokens > 0 || totalTurns > 0 ? "ok" : "muted"}
        />
        <SessionMetricCard
          icon={<TriangleAlert className="h-4 w-4" />}
          label={t("sessions.missingFiles")}
          value={String(missingFileCount)}
          detail={t("sessions.totalSizeValue", { size: formatBytes(totalSize) })}
          tone={missingFileCount > 0 ? "warn" : "muted"}
        />
      </div>

      <BentoCard className="p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">{t("sessions.sessionListTitle")}</h2>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("sessions.sessionListDesc")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={busy || sessionGroups.length === 0}
              onClick={expandAllGroups}
            >
              <ChevronDown />
              {t("sessions.expandAll")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || sessionGroups.length === 0}
              onClick={collapseAllGroups}
            >
              <ChevronRight />
              {t("sessions.collapseAll")}
            </Button>
            {selectedCount > 0 && (
              <Badge variant="secondary" className="font-normal">
                {t("sessions.selectedCount", { count: selectedCount })}
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={busy || selectedCount === 0}
              onClick={requestBulkDelete}
            >
              <Trash2 />
              {t("sessions.archiveSelected")}
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 border-b border-border px-3 py-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder={t("sessions.searchPlaceholder")}
              className="h-8 pl-8 text-[13px]"
            />
          </div>
          <div className="flex shrink-0 flex-wrap gap-1.5">
            <Button
              variant={statusFilter === "active" ? "default" : "outline"}
              size="sm"
              className="h-7"
              onClick={() => setStatusFilter("active")}
            >
              {t("sessions.filterActive")}
            </Button>
            <Button
              variant={statusFilter === "all" ? "default" : "outline"}
              size="sm"
              className="h-7"
              onClick={() => setStatusFilter("all")}
            >
              {t("sessions.filterAll")}
            </Button>
            <Button
              variant={statusFilter === "archived" ? "default" : "outline"}
              size="sm"
              className="h-7"
              onClick={() => setStatusFilter("archived")}
            >
              {t("sessions.filterArchived")}
            </Button>
            <Button
              variant={statusFilter === "missing" ? "default" : "outline"}
              size="sm"
              className="h-7"
              onClick={() => setStatusFilter("missing")}
            >
              {t("sessions.filterMissing")}
            </Button>
            <Badge variant="outline" className="h-7 rounded-[8px] px-2.5 font-normal">
              {t("sessions.filteredCount", { count: filteredSessions.length, total: sessions.length })}
            </Badge>
          </div>
        </div>
        {query.isLoading ? (
          <div className="p-3">
            <PilotTableSkeleton />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {sessionGroups.map((group) => {
              const expanded = expandedGroups.has(group.key);
              const groupPaths = group.sessions.map((session) => session.path);
              const selectedInGroup = groupPaths.filter((path) => selectedPaths.has(path)).length;
              const groupChecked = selectedInGroup === groupPaths.length && groupPaths.length > 0;
              return (
                <Fragment key={group.key}>
                  <div className="flex w-full items-center justify-between gap-2 bg-muted/20 px-3 py-2 transition-colors hover:bg-muted/45">
                    <div className="flex min-w-0 items-center gap-2">
                      <Checkbox
                        checked={groupChecked}
                        onCheckedChange={(checked) => toggleGroupSelection(groupPaths, checked === true)}
                        aria-label={t("sessions.selectGroup")}
                      />
                      <button
                        type="button"
                        onClick={() => toggleGroup(group.key)}
                        className="flex min-w-0 items-center gap-1.5 text-left"
                      >
                        {expanded ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <FolderOpen className="h-4 w-4 shrink-0 text-primary" />
                          <span className="truncate text-sm font-semibold">
                            {group.key === "__root__" ? t("sessions.unknownWorkspace") : group.label}
                          </span>
                          <Badge variant="secondary" className="font-normal">
                            {t("sessions.groupCount", { count: group.sessions.length })}
                          </Badge>
                          <Badge variant="outline" className="font-normal">
                            {t("sessions.providerGroupCount", {
                              count: new Set(group.sessions.map((session) => session.modelProvider).filter(Boolean)).size,
                            })}
                          </Badge>
                        {selectedInGroup > 0 && (
                          <Badge variant="outline" className="font-normal">
                            {t("sessions.selectedCount", { count: selectedInGroup })}
                          </Badge>
                        )}
                      </button>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatBytes(group.totalSize)}
                    </span>
                  </div>
                  {expanded &&
                    group.sessions.map((session) => (
                      <div key={session.path} className={cn("px-3 py-2 pl-8", session.archived && "bg-muted/25 opacity-75")}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 gap-2">
                            <Checkbox
                              checked={selectedPaths.has(session.path)}
                              onCheckedChange={(checked) => toggleSession(session.path, checked === true)}
                              aria-label={t("sessions.selectSession")}
                              className="mt-0.5"
                            />
                            <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <MessagesSquare className="h-4 w-4 text-primary" />
                              <span className="truncate text-sm font-semibold">{session.title || session.preview || session.id}</span>
                              {session.modelProvider && (
                                <Badge variant="secondary" className="font-normal">
                                  {session.modelProvider}
                                </Badge>
                              )}
                              {session.model && (
                                <Badge variant="outline" className="font-normal">
                                  {session.model}
                                </Badge>
                              )}
                              {session.cliVersion && (
                                <Badge variant="outline" className="font-normal">
                                  {session.cliVersion}
                                </Badge>
                              )}
                              <Badge variant="outline" className="font-normal">
                                {compactNumber(session.tokensUsed)} tokens
                              </Badge>
                              <SessionStatusBadges session={session} />
                            </div>
                            {session.preview && (
                              <div className="mt-1 truncate text-xs text-foreground/80">{session.preview}</div>
                            )}
                            <div className="mt-1 grid gap-1 text-xs text-muted-foreground md:grid-cols-3">
                              <span className="truncate">
                                {t("pilot.workspace")}: {session.cwd || "-"}
                              </span>
                              <span className="truncate">
                                {t("pilot.origin")}: {session.source || session.originator || "-"}
                              </span>
                              <span className="truncate">
                                {t("sessions.createdAt")}: {formatDateTimeMaybe(session.createdAtEpoch ?? session.createdAt)}
                              </span>
                              <span className="truncate">
                                {t("pilot.updated")}: {session.updatedAt ? formatDateTime(session.updatedAt) : "-"}
                              </span>
                              <span className="truncate">
                                {t("sessions.messageCount", { count: session.messageCount })}
                              </span>
                              <span className="truncate">
                                {t("sessions.gitBranch")}: {session.gitBranch || "-"}
                              </span>
                            </div>
                            <div className="mt-1 truncate text-xs text-muted-foreground">{session.path}</div>
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-2">
                            <div className="text-right text-xs text-muted-foreground">
                              <div>{formatBytes(session.sizeBytes)}</div>
                              {!session.fileExists && <div className="text-amber-600">{t("sessions.fileMissing")}</div>}
                            </div>
                            <div className="flex flex-wrap justify-end gap-1.5">
                              <Button
                                variant="outline"
                                size="xs"
                                onClick={() => setDetailTarget(session)}
                                disabled={busy}
                              >
                                <Search />
                                {t("sessions.detail")}
                              </Button>
                              <Button
                                variant="outline"
                                size="xs"
                                onClick={() => api.openPath(session.path)}
                                disabled={busy || !session.fileExists}
                              >
                                <FolderOpen />
                                {t("sessions.open")}
                              </Button>
                              <Button
                                variant="outline"
                                size="xs"
                                onClick={() => setDeleteTarget(session)}
                                disabled={busy || session.archived}
                                className="text-muted-foreground hover:border-destructive hover:bg-destructive hover:text-white"
                              >
                                <Trash2 />
                                {t("sessions.archive")}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                </Fragment>
              );
            })}
            {!payload?.items.length && (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                {t("sessions.empty")}
              </div>
            )}
            {sessions.length > 0 && filteredSessions.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                {t("sessions.noMatches")}
              </div>
            )}
          </div>
        )}
      </BentoCard>

      <Dialog open={detailTarget !== null} onOpenChange={(open) => !open && setDetailTarget(null)}>
        <DialogContent className="max-w-[680px] p-0">
          <DialogHeader>
            <div className="border-b border-border px-4 py-3.5">
              <DialogTitle>{t("sessions.detailTitle")}</DialogTitle>
              <DialogDescription className="mt-1.5">
                {t("sessions.detailDesc")}
              </DialogDescription>
            </div>
          </DialogHeader>
          {detailTarget && (
            <div className="grid max-h-[68vh] gap-3 overflow-y-auto px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="font-normal">
                  {t("sessions.turnCount", { count: detailTarget.turnCount })}
                </Badge>
                <Badge variant="outline" className="font-normal">
                  {t("sessions.messageCount", { count: detailTarget.messageCount })}
                </Badge>
                <Badge variant="outline" className="font-normal">
                  {t("sessions.eventCount", { count: detailTarget.eventCount })}
                </Badge>
                <SessionStatusBadges session={detailTarget} />
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <SessionDetailLine label={t("sessions.sessionId")} value={detailTarget.id} />
                <SessionDetailLine label={t("sessions.threadTitle")} value={detailTarget.title || detailTarget.preview} />
                <SessionDetailLine label={t("pilot.provider")} value={detailTarget.modelProvider} />
                <SessionDetailLine label={t("sessions.model")} value={detailTarget.model} />
                <SessionDetailLine label={t("sessions.reasoningEffort")} value={detailTarget.reasoningEffort} />
                <SessionDetailLine label={t("pilot.workspace")} value={detailTarget.cwd} />
                <SessionDetailLine label={t("pilot.origin")} value={detailTarget.source || detailTarget.originator} />
                <SessionDetailLine label={t("sessions.createdAt")} value={formatDateTimeMaybe(detailTarget.createdAtEpoch ?? detailTarget.createdAt)} />
                <SessionDetailLine label={t("pilot.updated")} value={detailTarget.updatedAt ? formatDateTime(detailTarget.updatedAt) : "-"} />
                <SessionDetailLine label={t("sessions.cliVersion")} value={detailTarget.cliVersion} />
                <SessionDetailLine label={t("sessions.tokensUsed")} value={compactNumber(detailTarget.tokensUsed)} />
                <SessionDetailLine label={t("sessions.gitBranch")} value={detailTarget.gitBranch} />
                <SessionDetailLine label={t("sessions.threadStatus")} value={detailTarget.archived ? t("sessions.archived") : t("sessions.active")} />
                <SessionDetailLine label={t("pilot.size")} value={formatBytes(detailTarget.sizeBytes)} />
              </div>
              {detailTarget.preview && (
                <div className="rounded-[8px] border bg-muted/20 p-3 text-xs text-muted-foreground">
                  <div className="font-medium text-foreground">{t("sessions.preview")}</div>
                  <div className="mt-1 whitespace-pre-wrap">{detailTarget.preview}</div>
                </div>
              )}
              <div className="rounded-[8px] border bg-muted/20 p-3 text-xs text-muted-foreground">
                <div className="font-medium text-foreground">{t("sessions.filePath")}</div>
                <div className="mt-1 break-all font-mono">{detailTarget.path}</div>
              </div>
            </div>
          )}
          <DialogFooter className="border-t border-border px-4 py-3">
            <Button variant="outline" onClick={() => setDetailTarget(null)}>
              {t("common.close")}
            </Button>
            <Button
              onClick={() => detailTarget && api.openPath(detailTarget.path)}
              disabled={!detailTarget || !detailTarget.fileExists}
            >
              <FolderOpen />
              {t("sessions.open")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("sessions.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("sessions.deleteConfirmDesc", {
                session: deleteTarget?.id || "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.path)}
            >
              {deleteMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("sessions.archive")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={recoverConfirmOpen} onOpenChange={(open) => !open && setRecoverConfirmOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("sessions.recoverConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("sessions.recoverConfirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setRecoverConfirmOpen(false);
                recoverMutation.mutate();
              }}
            >
              {recoverMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("sessions.recover")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeletePaths.length > 0} onOpenChange={(open) => !open && setBulkDeletePaths([])}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("sessions.bulkDeleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("sessions.bulkDeleteConfirmDesc", { count: bulkDeletePaths.length })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => bulkDeleteMutation.mutate(bulkDeletePaths)}
            >
              {bulkDeleteMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("sessions.archive")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function toastError(title: string, error: unknown) {
  toast({
    title,
    description: error instanceof Error ? error.message : String(error),
    variant: "destructive",
  });
}

function compactNumber(value: number | null | undefined) {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value ?? 0);
}

function groupSessionsByWorkspace(sessions: PilotSessionSummary[]) {
  const groups = new Map<
    string,
    { key: string; label: string; sessions: PilotSessionSummary[]; totalSize: number; latest: number }
  >();
  for (const session of sessions) {
    const key = session.cwd || "__root__";
    const current = groups.get(key) ?? {
      key,
      label: session.cwd || "__root__",
      sessions: [],
      totalSize: 0,
      latest: 0,
    };
    current.sessions.push(session);
    current.totalSize += session.sizeBytes;
    current.latest = Math.max(current.latest, session.updatedAt ?? 0);
    groups.set(key, current);
  }
  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      sessions: group.sessions.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)),
    }))
    .sort((a, b) => b.latest - a.latest);
}

function SessionStatusBadges({ session }: { session: PilotSessionSummary }) {
  const { t } = useTranslation();
  return (
    <>
      <Badge variant="outline" className="font-normal">
        <Split className="mr-1 h-3 w-3" />
        {session.indexed ? t("sessions.officialIndex") : t("sessions.localFile")}
      </Badge>
      <Badge
        variant={session.archived ? "outline" : "secondary"}
        className={cn(
          "font-normal",
          session.archived && "border-amber-500/40 text-amber-600 dark:text-amber-400",
        )}
      >
        {session.archived ? t("sessions.archived") : t("sessions.active")}
      </Badge>
      {!session.fileExists && (
        <Badge variant="outline" className="border-amber-500/40 font-normal text-amber-600 dark:text-amber-400">
          {t("sessions.fileMissing")}
        </Badge>
      )}
    </>
  );
}

function SessionDetailLine({ label, value }: { label: string; value: string | null | undefined }) {
  const displayValue = value || "-";
  return (
    <div className="rounded-[8px] border bg-card px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-[13px] font-medium" title={displayValue}>
        {displayValue}
      </div>
    </div>
  );
}

function SessionMetricCard({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail?: string;
  tone: "ok" | "muted" | "warn";
}) {
  return (
    <BentoCard compact className="min-h-[72px]">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className={
            tone === "ok"
              ? "text-primary"
              : tone === "warn"
                ? "text-amber-500"
                : "text-muted-foreground"
          }
        >
          {icon}
        </span>
        {label}
      </div>
      <div className="mt-1 truncate text-base font-semibold" title={value}>
        {value}
      </div>
      {detail && (
        <div className="mt-1 truncate text-xs text-muted-foreground" title={detail}>
          {detail}
        </div>
      )}
    </BentoCard>
  );
}
