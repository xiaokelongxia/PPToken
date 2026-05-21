import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Copy,
  Download,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format-time";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import type { AccountImportPreviewPayload, PilotAccountSummary, RelayProvider } from "@/types";
import { ApiProxyDialog } from "@/components/runtime/api-proxy-dialog";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { PilotTableSkeleton } from "@/components/pilot/pilot-ui";

const OFFICIAL_PLAN_OPTIONS = [
  "free",
  "plus",
  "5x pro",
  "20x pro",
  "team",
  "business",
  "enterprise",
  "edu",
];

export function AccountsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<PilotAccountSummary | null>(null);
  const [switchTarget, setSwitchTarget] = useState<PilotAccountSummary | null>(null);
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<AccountImportPreviewPayload | null>(null);
  const [importPreviewOpen, setImportPreviewOpen] = useState(false);
  const [proxyOpen, setProxyOpen] = useState(false);
  const [selectedAccountKey, setSelectedAccountKey] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [planFilter, setPlanFilter] = useState("all");

  const query = useQuery({
    queryKey: ["pilot", "accounts"],
    queryFn: () => api.loadPilotAccounts(),
  });
  const snapshotQuery = useQuery({
    queryKey: ["snapshot"],
    queryFn: () => api.loadSnapshot(true),
  });
  const relayQuery = useQuery({
    queryKey: ["pilot", "relay"],
    queryFn: () => api.loadRelayState(),
  });

  const payload = query.data?.data;
  const snapshot = snapshotQuery.data?.data ?? null;
  const apiConnectivity = snapshot?.status.apiConnectivity ?? null;
  const currentProxy = snapshot?.status.api.proxy ?? null;
  const relayPayload = relayQuery.data?.data ?? null;
  const activeRelayProvider = useMemo(() => {
    const activeRelayId = relayPayload?.activeByIde.codex;
    if (!activeRelayId) return null;
    return relayPayload?.providers.find((provider) => provider.id === activeRelayId) ?? null;
  }, [relayPayload]);

  const accounts = payload?.items ?? [];
  const activeAccount = accounts.find((account) => account.active) ?? null;
  const previewAccounts = importPreview?.accounts ?? [];

  const planOptions = useMemo(() => {
    const seen = new Set(OFFICIAL_PLAN_OPTIONS);
    for (const account of accounts) {
      const normalized = account.plan?.trim().toLowerCase();
      if (normalized) seen.add(normalized);
    }
    return Array.from(seen);
  }, [accounts]);

  const filteredAccounts = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return accounts.filter((account) => {
      const normalizedPlan = account.plan?.trim().toLowerCase() ?? "";
      const planMatched = planFilter === "all" || normalizedPlan === planFilter;
      if (!planMatched) return false;
      if (!keyword) return true;
      return [
        account.alias,
        account.email,
        account.accountName,
        account.workspaceName,
        account.profileName,
        account.accountKey,
        account.authMode,
        account.plan,
        account.relayProviderName,
        account.relayProviderBaseUrl,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword));
    });
  }, [accounts, planFilter, searchText]);

  const selectedAccount =
    accounts.find((account) => account.accountKey === selectedAccountKey) ??
    activeAccount ??
    filteredAccounts[0] ??
    accounts[0] ??
    null;

  const existingAccountKeys = useMemo(() => new Set(accounts.map((account) => account.accountKey)), [accounts]);
  const previewExistingCount = previewAccounts.filter((account) => existingAccountKeys.has(account.accountKey)).length;
  const previewNewCount = previewAccounts.length - previewExistingCount;

  useEffect(() => {
    if (!accounts.length) {
      setSelectedAccountKey(null);
      return;
    }
    if (!selectedAccountKey || !accounts.some((account) => account.accountKey === selectedAccountKey)) {
      setSelectedAccountKey(activeAccount?.accountKey ?? accounts[0]?.accountKey ?? null);
    }
  }, [accounts, activeAccount?.accountKey, selectedAccountKey]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["pilot", "accounts"] });
    queryClient.invalidateQueries({ queryKey: ["snapshot"] });
    queryClient.invalidateQueries({ queryKey: ["pilot", "relay"] });
  };

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const [rebuildResult, daemonResult] = await Promise.all([
        api.rebuildRegistry(),
        api.runDaemonOnce(),
      ]);
      return {
        accountCount: rebuildResult.data.accountCount,
        executedAt: daemonResult.data.executedAt,
      };
    },
    onSuccess: (res) => {
      invalidate();
      toast({
        title: t("accounts.enhancedRefreshDone"),
        description: t("accounts.enhancedRefreshDoneDesc", {
          count: res.accountCount,
          time: formatDateTime(res.executedAt),
        }),
      });
    },
    onError: (err) => toastError(t("accounts.enhancedRefreshFailed"), err),
  });

  const previewImportMutation = useMutation({
    mutationFn: async () => {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const path = await open({
        directory: false,
        multiple: false,
        title: t("accounts.importFileDialogTitle"),
        filters: [{ name: "PPToken accounts", extensions: ["json"] }],
      });
      if (typeof path !== "string") return null;
      return api.previewAccountImport(path);
    },
    onSuccess: (res) => {
      if (!res) {
        toast({
          title: t("accounts.importCancelled"),
          description: t("accounts.importCancelledDesc"),
        });
        return;
      }
      setImportPreview(res.data);
      setImportPreviewOpen(true);
      toast({
        title: t("accounts.importPreviewReady"),
        description: t("accounts.importPreviewReadyDesc", { count: res.data.accountCount }),
      });
    },
    onError: (err) => toastError(t("accounts.importFailed"), err),
  });

  const importMutation = useMutation({
    mutationFn: (input: { sourcePath: string; overwriteExisting: boolean }) =>
      api.importAccountsFromFile(input.sourcePath, input.overwriteExisting),
    onSuccess: (res) => {
      invalidate();
      setImportPreviewOpen(false);
      setImportPreview(null);
      toast({
        title: t("accounts.importDone"),
        description: t("accounts.importDoneDesc", { count: res.data.importedAccountKeys.length }),
      });
    },
    onError: (err) => toastError(t("accounts.importFailed"), err),
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const target = await save({
        defaultPath: "PPToken-accounts.json",
        filters: [{ name: "PPToken accounts", extensions: ["json"] }],
      });
      if (typeof target !== "string") return null;
      return api.exportAccountsToFile(target, true);
    },
    onSuccess: (res) => {
      if (!res) return;
      setExportConfirmOpen(false);
      toast({
        title: t("accounts.exportDone"),
        description: t("accounts.exportDoneDesc", { path: res.data.targetPath }),
      });
    },
    onError: (err) => toastError(t("accounts.exportFailed"), err),
  });

  const addAccountMutation = useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => {
      invalidate();
      setAddAccountOpen(false);
      toast({
        title: t("accounts.addAccountStarted"),
        description: t("accounts.addAccountStartedDesc"),
      });
    },
    onError: (err) => toastError(t("accounts.logoutFailed"), err),
  });

  const switchMutation = useMutation({
    mutationFn: (accountKey: string) => api.switchAccountAndRestartCodex(accountKey),
    onSuccess: (res) => {
      invalidate();
      setSwitchTarget(null);
      setSelectedAccountKey(res.data.switchedAccountKey);
      toast({
        title: t("accounts.restartSwitchDone"),
        description: t("accounts.restartSwitchDoneDesc", { account: res.data.switchedAccountKey }),
      });
    },
    onError: (err) => toastError(t("accounts.switchFailed"), err),
  });

  const removeMutation = useMutation({
    mutationFn: (accountKey: string) => api.removeAccounts([accountKey]),
    onSuccess: (res) => {
      setRemoveTarget(null);
      if (selectedAccountKey && res.data.deletedIds.includes(selectedAccountKey)) {
        setSelectedAccountKey(null);
      }
      invalidate();
      toast({
        title: t("accounts.removeDone"),
        description: t("accounts.removeDoneDesc", { count: res.data.deletedCount }),
      });
    },
    onError: (err) => toastError(t("accounts.removeFailed"), err),
  });

  const busy =
    refreshMutation.isPending ||
    previewImportMutation.isPending ||
    importMutation.isPending ||
    exportMutation.isPending ||
    addAccountMutation.isPending ||
    switchMutation.isPending ||
    removeMutation.isPending;

  const apiStatusLabel =
    snapshotQuery.isFetching
      ? t("overview.apiChecking")
      : apiConnectivity?.usageStatus === "reachable"
        ? t("overview.apiReachable")
        : apiConnectivity?.usageStatus === "unreachable"
          ? t("overview.apiUnreachable")
          : t("overview.apiChecking");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex shrink-0 flex-col gap-2">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <p className="max-w-3xl text-xs leading-snug text-muted-foreground">
            {t("pilot.accountsDesc")}
          </p>
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddAccountOpen(true)}
              disabled={busy}
              className="bg-card"
            >
              <Plus />
              {t("accounts.addAccount")}
            </Button>
            <Button
              size="icon-sm"
              onClick={() => refreshMutation.mutate()}
              disabled={busy}
              title={refreshMutation.isPending ? t("common.refreshing") : t("common.refresh")}
              aria-label={refreshMutation.isPending ? t("common.refreshing") : t("common.refresh")}
            >
              {refreshMutation.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <RefreshCw />
              )}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder={t("accounts.officialSearchPlaceholder")}
                className="h-8 rounded-[8px] bg-card pl-8 text-[13px]"
              />
            </div>
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="h-8 w-full rounded-[8px] bg-card text-[13px] sm:w-[128px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("accounts.officialAllPlans")}</SelectItem>
                {planOptions.map((plan) => (
                  <SelectItem key={plan} value={plan}>
                    {formatPlanLabel(plan)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => previewImportMutation.mutate()}
              disabled={busy}
              title={t("accounts.importTooltip")}
              className="bg-card"
            >
              {previewImportMutation.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
              {t("accounts.import")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExportConfirmOpen(true)}
              disabled={busy || !accounts.length}
              title={t("accounts.exportTooltip")}
              className="bg-card"
            >
              {exportMutation.isPending ? <Loader2 className="animate-spin" /> : <Download />}
              {t("accounts.export")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setProxyOpen(true)} className="bg-card">
              {t("overview.configureProxy")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refreshMutation.mutate()}
              disabled={busy}
              className="bg-card"
            >
              {refreshMutation.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              {t("common.refresh")}
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              apiConnectivity?.usageStatus === "reachable" ? "bg-emerald-500" : "bg-muted-foreground",
            )}
          />
          <span>{apiStatusLabel}</span>
          {(snapshotQuery.isFetching || refreshMutation.isPending) && (
            <RefreshCw className="h-3 w-3 animate-spin" />
          )}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-2 lg:grid-cols-[minmax(260px,340px)_1fr]">
        <section className="flex min-h-0 flex-col rounded-xl border border-border bg-card p-2.5">
          <h2 className="mb-2 px-1 text-sm font-medium text-muted-foreground">
            {t("accounts.officialAccountListTitle")}
          </h2>
          {query.isLoading ? (
            <div className="p-1">
              <PilotTableSkeleton />
            </div>
          ) : (
            <ScrollArea className="min-h-0 flex-1 pr-1">
              <div className="space-y-1.5">
                {filteredAccounts.map((account) => (
                  <AccountListItem
                    key={account.accountKey}
                    account={account}
                    activeRelayProvider={activeRelayProvider}
                    selected={selectedAccount?.accountKey === account.accountKey}
                    onSelect={() => setSelectedAccountKey(account.accountKey)}
                  />
                ))}
                {!accounts.length && (
                  <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                    {t("accounts.empty")}
                  </div>
                )}
                {accounts.length > 0 && filteredAccounts.length === 0 && (
                  <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                    {t("accounts.noMatches")}
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </section>

        <section className="flex min-h-0 flex-col rounded-xl border border-border bg-card p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              {t("accounts.selectedAccountPanelTitle")}
            </h2>
            {selectedAccount && (
              <Badge variant="secondary" className="rounded-full px-3 font-semibold">
                {formatStatusLabel(selectedAccount)}
              </Badge>
            )}
          </div>

          {selectedAccount ? (
            <SelectedAccountPanel
              account={selectedAccount}
              activeRelayProvider={activeRelayProvider}
              busy={busy}
              onCopy={copyAccountValue}
              onSwitch={() => setSwitchTarget(selectedAccount)}
              onRemove={() => setRemoveTarget(selectedAccount)}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              {t("accounts.emptySelected")}
            </div>
          )}
        </section>
      </div>

      {apiConnectivity?.usageStatus === "unreachable" && (
        <div className="mt-2 flex shrink-0 items-start gap-2 rounded-[8px] border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {t("accounts.staleDataDesc")}
            {apiConnectivity.usageLastError ? ` ${apiConnectivity.usageLastError}` : ""}
          </span>
        </div>
      )}

      <Dialog
        open={importPreviewOpen}
        onOpenChange={(open) => {
          if (!open) {
            setImportPreviewOpen(false);
            setImportPreview(null);
          }
        }}
      >
        <DialogContent className="max-w-[680px]">
          <DialogHeader>
            <DialogTitle>{t("accounts.importPreviewTitle")}</DialogTitle>
            <DialogDescription>{t("accounts.importPreviewDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-1.5 text-[13px] text-muted-foreground">
              <div>
                {t("accounts.importSource")}: <span className="break-all">{importPreview?.sourcePath || "-"}</span>
              </div>
              <div>{t("accounts.importPreviewReadyDesc", { count: importPreview?.accountCount ?? 0 })}</div>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <PreviewMetric label={t("accounts.importNewCount")} value={String(previewNewCount)} />
              <PreviewMetric label={t("accounts.importExistingCount")} value={String(previewExistingCount)} />
              <PreviewMetric label={t("accounts.importSkippedCount")} value={String(previewExistingCount)} />
            </div>
            <Separator />
            <ScrollArea className="h-[300px] pr-3">
              <div className="space-y-2.5">
                {previewAccounts.length ? (
                  previewAccounts.map((account) => {
                    const exists = existingAccountKeys.has(account.accountKey);
                    return (
                      <div key={account.accountKey} className="rounded-[8px] border border-border p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">
                            {account.alias || account.email || account.accountName || account.accountKey}
                          </span>
                          <Badge variant={exists ? "outline" : "secondary"} className="font-normal">
                            {exists ? t("accounts.importWillOverwrite") : t("accounts.importWillAdd")}
                          </Badge>
                          {exists && (
                            <Badge variant="outline" className="font-normal">
                              {t("accounts.importWillSkip")}
                            </Badge>
                          )}
                          {account.plan && <Badge variant="outline" className="font-normal">{account.plan}</Badge>}
                          {account.authMode && <Badge variant="secondary" className="font-normal">{formatAuthLabel(account)}</Badge>}
                        </div>
                        <div className="mt-2 grid gap-1 text-xs text-muted-foreground md:grid-cols-2">
                          <span className="truncate">{account.accountKey}</span>
                          <span className="truncate">{account.workspaceName || "-"}</span>
                          <span>{formatSubscriptionState(account)}</span>
                          <span>{account.lastUsedAt ? formatDateTime(account.lastUsedAt) : "-"}</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    {t("accounts.noPreviewAccounts")}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setImportPreviewOpen(false);
                setImportPreview(null);
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="outline"
              onClick={() => importPreview && importMutation.mutate({ sourcePath: importPreview.sourcePath, overwriteExisting: false })}
              disabled={!importPreview || importMutation.isPending}
            >
              {importMutation.isPending ? <Loader2 className="animate-spin" /> : null}
              {t("accounts.importOnlyNew")}
            </Button>
            <Button
              onClick={() => importPreview && importMutation.mutate({ sourcePath: importPreview.sourcePath, overwriteExisting: true })}
              disabled={!importPreview || importMutation.isPending}
            >
              {importMutation.isPending ? <Loader2 className="animate-spin" /> : null}
              {t("accounts.importOverwrite")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={addAccountOpen} onOpenChange={(open) => !open && setAddAccountOpen(false)}>
        <AlertDialogContent className="max-w-[390px]">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("accounts.addAccountTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("accounts.addAccountDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => addAccountMutation.mutate()}>
              {addAccountMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("common.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={exportConfirmOpen} onOpenChange={(open) => !open && setExportConfirmOpen(false)}>
        <AlertDialogContent className="max-w-[430px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              {t("accounts.exportConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("accounts.exportConfirmDesc", { count: accounts.length })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-[8px] border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            <div>· {t("accounts.exportImpactSecrets")}</div>
            <div>· {t("accounts.exportImpactShare")}</div>
            <div>· {t("accounts.exportImpactStore")}</div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => exportMutation.mutate()}>
              {exportMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("accounts.exportContinue")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={switchTarget !== null} onOpenChange={(open) => !open && setSwitchTarget(null)}>
        <AlertDialogContent className="max-w-[380px]">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("accounts.switchConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("accounts.switchConfirmDesc", { account: accountLabel(switchTarget) })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => switchTarget && switchMutation.mutate(switchTarget.accountKey)}>
              {switchMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("accounts.switchRestartOfficial")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={removeTarget !== null} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent className="max-w-[380px]">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("accounts.removeConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("accounts.removeConfirmDesc", { account: accountLabel(removeTarget) })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => removeTarget && removeMutation.mutate(removeTarget.accountKey)}
            >
              {removeMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("common.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ApiProxyDialog
        open={proxyOpen}
        onOpenChange={setProxyOpen}
        currentProxy={currentProxy}
        onSaved={() => {
          invalidate();
          return snapshotQuery.refetch();
        }}
        defaultModeOnOpen="manual"
      />
    </div>
  );

  function copyAccountValue(label: string, value: string | null | undefined) {
    if (!value) return;
    void navigator.clipboard.writeText(value);
    toast({
      title: t("accounts.copiedTitle", { label }),
      description: t("common.toastCopiedDesc"),
    });
  }
}

function AccountListItem({
  account,
  activeRelayProvider,
  selected,
  onSelect,
}: {
  account: PilotAccountSummary;
  activeRelayProvider: RelayProvider | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const relayDisplay = accountRelayDisplay(account, activeRelayProvider);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left transition-colors",
        selected
          ? "bg-primary text-primary-foreground"
          : "hover:bg-muted/70",
      )}
    >
      <span
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          selected ? "bg-primary-foreground/80" : "bg-muted-foreground/45",
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">
          <AccountName account={account} />
        </div>
        <div
          className={cn(
            "mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs",
            selected ? "text-primary-foreground/75" : "text-muted-foreground",
          )}
        >
          <span className={cn("rounded-full px-2 py-0.5", selected ? "bg-white/16" : "bg-muted")}>
            {formatStatusLabel(account)}
          </span>
          <span>{t("accounts.primaryQuotaShort")} {formatQuotaValue(account.primaryWindow?.remainingPercent)}</span>
          <span>{t("accounts.weeklyQuotaShort")} {formatQuotaValue(account.secondaryWindow?.remainingPercent)}</span>
          {relayDisplay && (
            <span className="w-full truncate">
              {t(relayDisplay.labelKey)}: {relayDisplay.name}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function SelectedAccountPanel({
  account,
  activeRelayProvider,
  busy,
  onCopy,
  onSwitch,
  onRemove,
}: {
  account: PilotAccountSummary;
  activeRelayProvider: RelayProvider | null;
  busy: boolean;
  onCopy: (label: string, value: string | null | undefined) => void;
  onSwitch: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const relayDisplay = accountRelayDisplay(account, activeRelayProvider);

  return (
    <div className="min-h-0 flex-1 overflow-auto pr-1">
      <div className="flex flex-col gap-1.5">
        <h3 className="text-xl font-semibold tracking-tight">
          <AccountName account={account} />
        </h3>
        <button
          type="button"
          onClick={() => onCopy(t("accounts.snapshotSecret"), account.accountKey)}
          title={account.accountKey}
          className="flex max-w-full items-center gap-2 text-left text-xs text-muted-foreground hover:text-foreground"
        >
          <span className="shrink-0">{t("accounts.snapshotSecret")}:</span>
          <span className="truncate font-mono">{account.accountKey}</span>
          <Copy className="h-3.5 w-3.5 shrink-0" />
        </button>
        {relayDisplay && (
          <div className="max-w-full truncate text-xs text-muted-foreground">
            {t(relayDisplay.labelKey)}: {relayDisplay.name}
            {relayDisplay.baseUrl ? ` · ${relayDisplay.baseUrl}` : ""}
          </div>
        )}
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <QuotaCard label={t("accounts.primaryQuotaShort")} percent={account.primaryWindow?.remainingPercent} />
        <QuotaCard label={t("accounts.weeklyQuotaShort")} percent={account.secondaryWindow?.remainingPercent} />
      </div>

      <div className="mt-3 overflow-hidden rounded-[8px] border border-border">
        <InfoRow label={t("accounts.workspaceName")} value={account.workspaceName || t("accounts.notFetched")} />
        <InfoRow label={t("accounts.userNickname")} value={accountNickname(account, t("accounts.notFetched"))} />
        <InfoRow label={t("accounts.authMode")} value={formatAuthLabel(account)} />
        <InfoRow label={t("accounts.subscriptionState")} value={formatSubscriptionState(account)} />
        <InfoRow
          label={t("accounts.expiresAt")}
          value={account.subscriptionExpiresAt ? formatDateTime(account.subscriptionExpiresAt) : t("accounts.notFetched")}
        />
        <InfoRow label={t("accounts.autoRenew")} value={formatRenewState(account)} />
        {relayDisplay && (
          <InfoRow
            label={t(relayDisplay.labelKey)}
            value={`${relayDisplay.name}${relayDisplay.baseUrl ? ` · ${relayDisplay.baseUrl}` : ""}`}
          />
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Button onClick={onSwitch} disabled={busy || account.active}>
          <RotateCcw />
          {t("accounts.switchToThisAccount")}
        </Button>
        <Button
          variant="outline"
          onClick={() => onCopy(t("accounts.email"), account.email || account.accountName || account.alias || account.accountKey)}
          className="bg-card"
        >
          <Copy />
          {t("accounts.copyEmail")}
        </Button>
        <Button
          variant="outline"
          onClick={onRemove}
          disabled={busy}
          className="border-destructive/20 bg-card text-destructive hover:border-destructive hover:bg-destructive hover:text-white"
        >
          <Trash2 />
          {t("accounts.removeSnapshot")}
        </Button>
      </div>
    </div>
  );
}

function QuotaCard({
  label,
  percent,
}: {
  label: string;
  percent?: number | null;
}) {
  const normalized = typeof percent === "number" ? Math.max(0, Math.min(100, percent)) : null;
  return (
    <div className="rounded-[8px] border border-border bg-card px-3 py-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className="font-semibold">{normalized === null ? "—" : `${normalized}%`}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", normalized === null || normalized < 20 ? "bg-muted-foreground/20" : "bg-primary")}
          style={{ width: `${normalized ?? 0}%` }}
        />
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-medium" title={value}>
        {value}
      </span>
    </div>
  );
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border bg-muted/20 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}

function accountLabel(account: PilotAccountSummary | null) {
  if (!account) return "";
  if (account.alias) return account.alias;
  if (account.authMode === "apikey" && account.relayProviderName) {
    return `${account.relayProviderName} API Key`;
  }
  if (account.authMode === "apikey") return "API Key";
  return account.alias || account.email || account.accountName || account.accountKey;
}

function accountRelayDisplay(account: PilotAccountSummary, activeRelayProvider: RelayProvider | null) {
  if (account.relayProviderName) {
    return {
      id: account.relayProviderId,
      name: account.relayProviderName,
      baseUrl: account.relayProviderBaseUrl,
      badgeKey: "accounts.relayProviderBadge",
      labelKey: "accounts.relayProvider",
    } as const;
  }
  if (account.active && activeRelayProvider) {
    return {
      id: activeRelayProvider.id,
      name: activeRelayProvider.name,
      baseUrl: activeRelayProvider.baseUrl,
      badgeKey: "accounts.activeRelayProviderBadge",
      labelKey: "accounts.activeRelayProvider",
    } as const;
  }
  return null;
}

function AccountName({ account }: { account: PilotAccountSummary }) {
  if (account.alias) return <>{account.alias}</>;
  if (account.authMode === "apikey") return <>API Key</>;
  return <>{account.email || account.accountName || account.accountKey}</>;
}

function formatQuotaValue(value: number | undefined | null) {
  return typeof value === "number" ? `${Math.max(0, Math.min(100, value))}%` : "—";
}

function formatStatusLabel(account: PilotAccountSummary) {
  if (account.plan) return formatPlanLabel(account.plan);
  if (account.hasActiveSubscription === true) return "Active";
  if (account.hasActiveSubscription === false) return "Inactive";
  return "Unknown";
}

function formatPlanLabel(plan: string) {
  const normalized = plan.trim().toLowerCase();
  switch (normalized) {
    case "":
    case "unknown":
      return "Unknown";
    case "free":
      return "Free";
    case "plus":
      return "Plus";
    case "pro5x":
    case "5xpro":
    case "5x pro":
      return "5x Pro";
    case "pro20x":
    case "20xpro":
    case "20x pro":
      return "20x Pro";
    case "team":
      return "Team";
    case "business":
      return "Business";
    case "enterprise":
      return "Enterprise";
    case "edu":
      return "Edu";
    default:
      return plan || "Unknown";
  }
}

function accountNickname(account: PilotAccountSummary, fallback: string) {
  if (account.authMode?.toLowerCase() === "apikey") return fallback;
  if (account.email) return account.email;
  return account.accountName || account.alias || fallback;
}

function formatAuthLabel(account: PilotAccountSummary) {
  return account.authMode?.toLowerCase() === "apikey" ? "API Key" : account.authMode || "-";
}

function formatSubscriptionState(account: PilotAccountSummary) {
  if (account.hasActiveSubscription === true) return "Active";
  if (account.hasActiveSubscription === false) return "Inactive";
  return "未获取";
}

function formatRenewState(account: PilotAccountSummary) {
  if (account.subscriptionWillRenew === true) return "是";
  if (account.subscriptionWillRenew === false) return "否";
  return "未获取";
}

function toastError(title: string, error: unknown) {
  toast({
    title,
    description: error instanceof Error ? error.message : String(error),
    variant: "destructive",
  });
}
