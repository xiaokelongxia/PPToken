import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  Eye,
  FileWarning,
  KeyRound,
  Layers3,
  Loader2,
  MoreHorizontal,
  Network,
  Plus,
  RefreshCw,
  Route,
  Search,
  Server,
  Sparkles,
  Upload,
  Wrench,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format-time";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import type {
  AdminRelayStation,
  RelayProvider,
  RelayRouteDiagnosticPayload,
  RelayUpsertInput,
} from "@/types";
import { Badge } from "@/components/ui/badge";
import { BentoCard } from "@/components/ui/bento-card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { PilotPageHeader, PilotTableSkeleton } from "@/components/pilot/pilot-ui";

const DEFAULT_FORM: RelayProviderForm = {
  id: "",
  name: "",
  baseUrl: "",
  apiKey: "",
  model: "",
  wireApi: "responses",
  network: "direct",
  extraHeaders: "",
};

interface RelayProviderForm {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  wireApi: string;
  network: string;
  extraHeaders: string;
}

type RecommendedRelayStation = AdminRelayStation;

const RELAY_MODEL_PRESETS = [
  { id: "gpt-5.5", label: "GPT-5.5", model: "gpt-5.5", wireApi: "responses" },
  { id: "gpt-4.1", label: "GPT-4.1", model: "gpt-4.1", wireApi: "responses" },
  { id: "claude-sonnet-4.5", label: "Claude Sonnet 4.5", model: "claude-sonnet-4.5", wireApi: "anthropic" },
  { id: "deepseek-chat", label: "DeepSeek Chat", model: "deepseek-chat", wireApi: "responses" },
];

const RELAY_PROVIDER_PRESETS = [
  {
    id: "openai",
    name: "OpenAI 官方",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1",
    wireApi: "responses",
    network: "direct",
  },
  {
    id: "anthropic",
    name: "Claude 官方",
    baseUrl: "https://api.anthropic.com",
    model: "claude-sonnet-4.5",
    wireApi: "anthropic",
    network: "direct",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    wireApi: "responses",
    network: "direct",
  },
  {
    id: "pptoken",
    name: "PPToken",
    baseUrl: "https://api.pptoken.org/v1",
    model: "gpt-5.5",
    wireApi: "responses",
    network: "direct",
  },
  {
    id: "local-openai",
    name: "本地 OpenAI 兼容",
    baseUrl: "http://127.0.0.1:11434/v1",
    model: "gpt-4.1",
    wireApi: "responses",
    network: "system",
  },
] as const;

export function RelayPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [diagnostics, setDiagnostics] = useState<RelayRouteDiagnosticPayload | null>(null);
  const [form, setForm] = useState<RelayProviderForm>(DEFAULT_FORM);
  const [deleteTarget, setDeleteTarget] = useState<RelayProvider | null>(null);
  const [modelCatalogTarget, setModelCatalogTarget] = useState<RelayProvider | null>(null);
  const [routerConfirmOpen, setRouterConfirmOpen] = useState(false);
  const [routerTargetEnabled, setRouterTargetEnabled] = useState(false);
  const [repairConfirmOpen, setRepairConfirmOpen] = useState(false);
  const [importConfirmOpen, setImportConfirmOpen] = useState(false);
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<RelayProvider | null>(null);
  const [detailTarget, setDetailTarget] = useState<RelayProvider | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [providerFilter, setProviderFilter] = useState<"all" | "enabled" | "disabled" | "failed">("all");
  const [draftTestResult, setDraftTestResult] = useState<{
    ok: boolean;
    message: string;
    providerId: string;
  } | null>(null);
  const [draftModels, setDraftModels] = useState<string[]>([]);

  const query = useQuery({
    queryKey: ["pilot", "relay"],
    queryFn: () => api.loadRelayState(),
  });
  const adminContentQuery = useQuery({
    queryKey: ["admin-content"],
    queryFn: () => api.loadAdminContent(),
  });
  const routingQuery = useQuery({
    queryKey: ["pilot", "routing"],
    queryFn: () => api.loadRouting(),
  });
  const payload = query.data?.data;
  const recommendedRelayStations = useMemo(
    () =>
      (adminContentQuery.data?.data.content.relayStations ?? [])
        .filter((station) => station.enabled)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [adminContentQuery.data],
  );
  const routing = routingQuery.data?.data ?? null;
  const activeRelayId = payload?.activeByIde.codex ?? null;
  const activeProvider = useMemo(
    () => payload?.providers.find((provider) => provider.id === activeRelayId) ?? null,
    [activeRelayId, payload],
  );
  const selectedProvider = useMemo(() => {
    if (!payload?.providers.length) return null;
    return (
      payload.providers.find((provider) => provider.id === selectedProviderId) ??
      activeProvider ??
      payload.providers[0] ??
      null
    );
  }, [activeProvider, payload, selectedProviderId]);
  const modelCatalogProvider = useMemo(
    () =>
      modelCatalogTarget
        ? payload?.providers.find((provider) => provider.id === modelCatalogTarget.id) ?? modelCatalogTarget
        : null,
    [modelCatalogTarget, payload],
  );
  const enabledProviders = useMemo(
    () => (payload?.providers ?? []).filter((provider) => provider.enabled),
    [payload],
  );
  const filteredProviders = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return (payload?.providers ?? []).filter((provider) => {
      if (providerFilter === "enabled" && !provider.enabled) return false;
      if (providerFilter === "disabled" && provider.enabled) return false;
      if (providerFilter === "failed" && provider.healthScore !== 0 && !provider.errorMessage) return false;
      if (!keyword) return true;
      return [
        provider.id,
        provider.name,
        provider.baseUrl,
        provider.model,
        provider.wireApi,
        provider.network,
        provider.errorMessage,
        provider.lastError,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword));
    });
  }, [payload, providerFilter, searchText]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["pilot", "relay"] });
    queryClient.invalidateQueries({ queryKey: ["pilot", "routing"] });
  };

  const routerMutation = useMutation({
    mutationFn: (enabled: boolean) => api.setCodexRouterEnabled(enabled),
    onSuccess: (_res, enabled) => {
      invalidate();
      toast({
        title: t("relay.routerSaved"),
        description: enabled ? t("relay.routerEnabledDesc") : t("relay.routerDisabledDesc"),
      });
    },
    onError: (err) => toastError(t("relay.routerFailed"), err),
  });

  const upsertMutation = useMutation({
    mutationFn: (input: RelayUpsertInput) => api.upsertRelayProvider(input),
    onSuccess: (_res, input) => {
      setDialogOpen(false);
      setForm(DEFAULT_FORM);
      invalidate();
      toast({
        title: t("relay.providerSaved"),
        description: t("relay.providerSavedDesc", { provider: input.id || input.name || "-" }),
      });
    },
    onError: (err) => toastError(t("relay.providerSaveFailed"), err),
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => api.activateRelayProvider(id),
    onSuccess: (_res, id) => {
      invalidate();
      toast({
        title: t("relay.providerActivated"),
        description: t("relay.providerActivatedDesc", { provider: id }),
      });
    },
    onError: (err) => toastError(t("relay.providerActivateFailed"), err),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => api.deactivateRelayProvider(id),
    onSuccess: (_res, id) => {
      setDeactivateTarget(null);
      invalidate();
      toast({
        title: t("relay.providerDeactivated"),
        description: t("relay.providerDeactivatedDesc", { provider: id }),
      });
    },
    onError: (err) => toastError(t("relay.providerDeactivateFailed"), err),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteRelayProvider(id),
    onSuccess: (_res, id) => {
      setDeleteTarget(null);
      invalidate();
      toast({
        title: t("relay.providerDeleted"),
        description: t("relay.providerDeletedDesc", { provider: id }),
      });
    },
    onError: (err) => toastError(t("relay.providerDeleteFailed"), err),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => api.testRelayProvider(id),
    onSuccess: (res) => {
      invalidate();
      toast({
        title: res.data.reachable ? t("relay.testReachable") : t("relay.testFailed"),
        description: res.data.message,
        variant: res.data.reachable ? "default" : "destructive",
      });
    },
    onError: (err) => toastError(t("relay.testFailed"), err),
  });

  const draftTestMutation = useMutation({
    mutationFn: async (input: RelayProviderForm) => {
      if (!input.id.trim() || !input.name.trim() || !input.baseUrl.trim() || !input.model.trim()) {
        throw new Error(t("relay.draftTestMissingFields"));
      }
      let extraHeaders: Record<string, string> = {};
      const trimmedHeaders = input.extraHeaders.trim();
      if (trimmedHeaders) {
        const parsed = JSON.parse(trimmedHeaders) as unknown;
        if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
          throw new Error(t("relay.invalidHeadersDesc"));
        }
        extraHeaders = Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [
            key,
            String(value),
          ]),
        );
      }
      const id = `${input.id.trim()}-draft-${Date.now()}`.replace(/[^a-zA-Z0-9_-]/g, "_");
      await api.upsertRelayProvider({
        id,
        name: `${input.name.trim()} Draft`,
        ide: "codex",
        baseUrl: input.baseUrl,
        apiKey: input.apiKey,
        model: input.model,
        wireApi: input.wireApi,
        network: input.network,
        extraHeaders,
      });
      const result = await api.testRelayProvider(id);
      await api.deleteRelayProvider(id);
      return {
        ok: result.data.reachable,
        message: result.data.message,
        providerId: input.id.trim(),
      };
    },
    onSuccess: (res) => {
      setDraftTestResult(res);
      toast({
        title: res.ok ? t("relay.testReachable") : t("relay.testFailed"),
        description: res.message,
        variant: res.ok ? "default" : "destructive",
      });
    },
    onError: (err) => {
      setDraftTestResult({
        ok: false,
        message: err instanceof Error ? err.message : String(err),
        providerId: form.id || "-",
      });
      toastError(t("relay.testFailed"), err);
    },
  });

  const fetchModelsMutation = useMutation({
    mutationFn: (id: string) => api.fetchRelayModelsDraft(id),
    onSuccess: (res, id) => {
      invalidate();
      toast({
        title: t("relay.modelsFetched"),
        description: t("relay.modelsFetchedDesc", { count: res.data.models.length, provider: id }),
      });
    },
    onError: (err) => toastError(t("relay.modelsFetchFailed"), err),
  });

  const fetchDraftModelsMutation = useMutation({
    mutationFn: async (input: RelayProviderForm) => {
      if (!input.baseUrl.trim()) {
        throw new Error(t("relay.draftModelsMissingFields"));
      }
      let extraHeaders: Record<string, string> = {};
      const trimmedHeaders = input.extraHeaders.trim();
      if (trimmedHeaders) {
        const parsed = JSON.parse(trimmedHeaders) as unknown;
        if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
          throw new Error(t("relay.invalidHeadersDesc"));
        }
        extraHeaders = Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [
            key,
            String(value),
          ]),
        );
      }
      return api.fetchRelayModelsFromDraft({
        baseUrl: input.baseUrl,
        apiKey: input.apiKey,
        wireApi: input.wireApi,
        extraHeaders,
      });
    },
    onSuccess: (res) => {
      setDraftModels(res.data.models);
      if (!form.model.trim() && res.data.models.length > 0) {
        setForm((current) => ({ ...current, model: res.data.models[0] }));
      }
      toast({
        title: t("relay.modelsFetched"),
        description: t("relay.modelsFetchedDesc", { count: res.data.models.length }),
        variant: res.data.models.length > 0 ? "default" : "destructive",
      });
    },
    onError: (err) => toastError(t("relay.modelsFetchFailed"), err),
  });

  const updateModelMutation = useMutation({
    mutationFn: ({ provider, model }: { provider: RelayProvider; model: string }) =>
      api.upsertRelayProvider({
        id: provider.id,
        name: provider.name,
        ide: provider.ide,
        baseUrl: provider.baseUrl,
        apiKey: "",
        model,
        wireApi: provider.wireApi,
        network: provider.network,
        extraHeaders: provider.extraHeaders,
      }),
    onSuccess: (_res, input) => {
      setModelCatalogTarget(null);
      invalidate();
      toast({
        title: t("relay.modelSelected"),
        description: t("relay.modelSelectedDesc", { model: input.model }),
      });
    },
    onError: (err) => toastError(t("relay.providerSaveFailed"), err),
  });

  const diagnoseMutation = useMutation({
    mutationFn: () => api.runCodexRouterDiagnostics(),
    onSuccess: (res) => {
      setDiagnostics(res.data);
      setDiagnosticsOpen(true);
      toast({
        title: t("relay.diagnosticsReady"),
        description: t("relay.diagnosticsReadyDesc"),
      });
    },
    onError: (err) => toastError(t("relay.diagnosticsFailed"), err),
  });

  const repairMutation = useMutation({
    mutationFn: () => api.fixCodexRouterIssue(),
    onSuccess: (res) => {
      setDiagnostics(res.data);
      setDiagnosticsOpen(true);
      invalidate();
      toast({
        title: t("relay.repairDone"),
        description: t("relay.repairDoneDesc"),
      });
    },
    onError: (err) => toastError(t("relay.repairFailed"), err),
  });

  const exportMutation = useMutation({
    mutationFn: () => api.exportRelayConfig(),
    onSuccess: (res) => {
      setExportConfirmOpen(false);
      toast({
        title: t("relay.exportDone"),
        description: t("relay.exportDoneDesc", { path: res.data.filePath }),
      });
    },
    onError: (err) => toastError(t("relay.exportFailed"), err),
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const path = await open({
        directory: false,
        multiple: false,
        filters: [{ name: "PPToken relay", extensions: ["json"] }],
      });
      if (typeof path !== "string") return null;
      return api.importRelayConfig(path);
    },
    onSuccess: (res) => {
      if (!res) return;
      invalidate();
      toast({
        title: t("relay.importDone"),
        description: t("relay.importDoneDesc", { count: res.data.importedCount }),
      });
    },
    onError: (err) => toastError(t("relay.importFailed"), err),
  });

  const busy =
    routerMutation.isPending ||
    upsertMutation.isPending ||
    activateMutation.isPending ||
    deactivateMutation.isPending ||
    deleteMutation.isPending ||
    testMutation.isPending ||
    draftTestMutation.isPending ||
    fetchModelsMutation.isPending ||
    fetchDraftModelsMutation.isPending ||
    updateModelMutation.isPending ||
    diagnoseMutation.isPending ||
    repairMutation.isPending ||
    exportMutation.isPending ||
    importMutation.isPending;

  const openCreate = () => {
    setForm(DEFAULT_FORM);
    setDraftTestResult(null);
    setDraftModels([]);
    setDialogOpen(true);
  };

  const requestToggleRouter = () => {
    setRouterTargetEnabled(!payload?.codexRouterEnabled);
    setRouterConfirmOpen(true);
  };

  const confirmToggleRouter = () => {
    setRouterConfirmOpen(false);
    routerMutation.mutate(routerTargetEnabled);
  };

  const requestRepair = () => {
    setRepairConfirmOpen(true);
  };

  const confirmRepair = () => {
    setRepairConfirmOpen(false);
    repairMutation.mutate();
  };

  const requestImport = () => {
    setImportConfirmOpen(true);
  };

  const confirmImport = () => {
    setImportConfirmOpen(false);
    importMutation.mutate();
  };

  const requestExport = () => {
    setExportConfirmOpen(true);
  };

  const confirmExport = () => {
    exportMutation.mutate();
  };

  const openEdit = (provider: RelayProvider) => {
    setForm({
      id: provider.id,
      name: provider.name || provider.id,
      baseUrl: provider.baseUrl || "",
      apiKey: provider.apiKey || "",
      model: provider.model || "",
      wireApi: provider.wireApi || "responses",
      network: provider.network || "direct",
      extraHeaders: JSON.stringify(provider.extraHeaders ?? {}, null, 2),
    });
    setDraftTestResult(null);
    setDraftModels(provider.models ?? []);
    setDialogOpen(true);
  };

  const openModelCatalog = (provider: RelayProvider) => {
    setModelCatalogTarget(provider);
  };

  const saveProvider = () => {
    let extraHeaders: Record<string, string> = {};
    const trimmedHeaders = form.extraHeaders.trim();
    if (trimmedHeaders) {
      try {
        const parsed = JSON.parse(trimmedHeaders) as unknown;
        if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
          throw new Error("invalid");
        }
        extraHeaders = Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [
            key,
            String(value),
          ]),
        );
      } catch {
        toast({
          title: t("relay.invalidHeaders"),
          description: t("relay.invalidHeadersDesc"),
          variant: "destructive",
        });
        return;
      }
    }
    upsertMutation.mutate({
      id: form.id,
      name: form.name,
      ide: "codex",
      baseUrl: form.baseUrl,
      apiKey: form.apiKey,
      model: form.model,
      wireApi: form.wireApi,
      network: form.network,
      extraHeaders,
    });
  };

  return (
    <div>
      <div className="mb-2 flex flex-col gap-1.5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <PilotPageHeader
            description={t("pilot.relayDesc")}
            source={payload?.statePath}
            refreshing={query.isFetching}
            onRefresh={() => query.refetch()}
          />
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          <Button size="sm" onClick={openCreate} disabled={busy}>
            <Plus />
            {t("relay.addProvider")}
          </Button>
          <Button
            variant={payload?.codexRouterEnabled ? "default" : "outline"}
            size="sm"
            onClick={requestToggleRouter}
            disabled={busy}
          >
            {routerMutation.isPending ? <Loader2 className="animate-spin" /> : <Network />}
            {payload?.codexRouterEnabled ? t("relay.disableRouter") : t("relay.enableRouter")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => diagnoseMutation.mutate()} disabled={busy}>
            {diagnoseMutation.isPending ? <Loader2 className="animate-spin" /> : <Activity />}
            {t("relay.diagnose")}
          </Button>
          <Button variant="outline" size="sm" onClick={requestRepair} disabled={busy}>
            {repairMutation.isPending ? <Loader2 className="animate-spin" /> : <Wrench />}
            {t("relay.repair")}
          </Button>
          <Button variant="outline" size="icon-sm" onClick={requestImport} disabled={busy} title={t("relay.import")}>
            {importMutation.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
          </Button>
          <Button variant="outline" size="icon-sm" onClick={requestExport} disabled={busy || !payload?.providers.length} title={t("relay.export")}>
            {exportMutation.isPending ? <Loader2 className="animate-spin" /> : <Download />}
          </Button>
        </div>
      </div>

      <div className="mb-1.5 grid gap-1.5 md:grid-cols-3">
        <StatusCard
          icon={<Route className="h-4 w-4" />}
          label={t("relay.routerStatus")}
          value={routing?.codexRouterEnabled ? t("relay.enabled") : t("relay.disabled")}
          detail={routing?.statusMessage ?? t("relay.routerConsoleDesc")}
          tone={routing?.codexRouterEnabled ? "ok" : "muted"}
        />
        <StatusCard
          icon={<Server className="h-4 w-4" />}
          label={t("relay.activeProvider")}
          value={routing?.activeProvider || activeProvider?.name || activeProvider?.id || "-"}
          detail={routing?.activeModel ?? activeProvider?.model ?? undefined}
          tone={routing?.activeProvider || activeProvider ? "ok" : "muted"}
        />
        <StatusCard
          icon={<KeyRound className="h-4 w-4" />}
          label={t("relay.providerCount")}
          value={`${enabledProviders.length}/${payload?.providers.length ?? 0}`}
          detail={payload?.codexRouterEnabled ? t("relay.routerInjected") : t("relay.routerNotInjected")}
          tone={enabledProviders.length ? "ok" : "muted"}
        />
      </div>

      <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_320px]">
        <BentoCard className="p-0">
          <div className="flex items-center justify-between gap-2 border-b border-border px-2.5 py-1.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Layers3 className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">{t("relay.providersTitle")}</h2>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {t("relay.providersDesc")}
              </p>
            </div>
            <Badge variant="outline" className="h-7 rounded-[8px] px-2.5 font-normal">
              {t("relay.filteredCount", { count: filteredProviders.length, total: payload?.providers.length ?? 0 })}
            </Badge>
          </div>
          <div className="flex flex-col gap-1.5 border-b border-border px-2.5 py-1.5 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder={t("relay.searchPlaceholder")}
                className="h-8 pl-8 text-[13px]"
              />
            </div>
            <div className="flex shrink-0 flex-wrap gap-1.5">
              <Button
                variant={providerFilter === "all" ? "default" : "outline"}
                size="sm"
                className="h-7"
                onClick={() => setProviderFilter("all")}
              >
                {t("relay.filterAll")}
              </Button>
              <Button
                variant={providerFilter === "enabled" ? "default" : "outline"}
                size="sm"
                className="h-7"
                onClick={() => setProviderFilter("enabled")}
              >
                {t("relay.filterEnabled")}
              </Button>
              <Button
                variant={providerFilter === "disabled" ? "default" : "outline"}
                size="sm"
                className="h-7"
                onClick={() => setProviderFilter("disabled")}
              >
                {t("relay.filterDisabled")}
              </Button>
              <Button
                variant={providerFilter === "failed" ? "default" : "outline"}
                size="sm"
                className="h-7"
                onClick={() => setProviderFilter("failed")}
              >
                {t("relay.filterFailed")}
              </Button>
            </div>
          </div>
          {query.isLoading ? (
            <div className="p-3">
              <PilotTableSkeleton />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredProviders.map((provider) => {
                const isActive = provider.id === activeRelayId;
                const isSelected = selectedProvider?.id === provider.id;
                return (
                  <div
                    key={provider.id}
                    onClick={() => setSelectedProviderId(provider.id)}
                    className={cn(
                      "cursor-pointer px-2.5 py-1.5 transition-colors hover:bg-muted/40",
                      isSelected && "bg-primary/5",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {isActive ? (
                            <Route className="h-4 w-4 text-primary" />
                          ) : (
                            <Server className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="truncate text-sm font-semibold">{provider.name || provider.id}</span>
                          <Badge variant={isActive ? "default" : "secondary"} className="font-normal">
                            {isActive ? t("pilot.active") : t("pilot.inactive")}
                          </Badge>
                          <Badge variant="outline" className="font-normal">{wireApiLabel(provider.wireApi)}</Badge>
                          <Badge variant="outline" className="font-normal">
                            {provider.network === "system" ? t("relay.networkSystem") : t("relay.networkDirect")}
                          </Badge>
                        </div>
                        <div className="mt-1 grid gap-x-3 gap-y-0.5 text-[11px] leading-4 text-muted-foreground lg:grid-cols-[150px_minmax(0,1fr)_160px]">
                          <span className="truncate">{t("relay.providerId")}: {provider.id}</span>
                          <span className="truncate">{t("pilot.baseUrl")}: {provider.baseUrl || "-"}</span>
                          <span className="truncate">{t("relay.modelId")}: {provider.model || "-"}</span>
                          {provider.errorMessage && (
                            <span className="truncate text-destructive lg:col-span-3">{provider.errorMessage}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-start justify-end gap-1">
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => activateMutation.mutate(provider.id)}
                          disabled={busy || (isActive && provider.enabled)}
                        >
                          {activateMutation.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                          {provider.enabled ? t("relay.activate") : t("relay.enableProvider")}
                        </Button>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          onClick={() => testMutation.mutate(provider.id)}
                          disabled={busy}
                          aria-label={t("common.test")}
                          title={t("common.test")}
                        >
                          {testMutation.isPending ? <Loader2 className="animate-spin" /> : <Network className="h-3.5 w-3.5" />}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon-sm"
                              disabled={busy}
                              aria-label={t("relay.moreActions")}
                              title={t("relay.moreActions")}
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onSelect={() => setDetailTarget(provider)}>
                              {t("relay.detail")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => openEdit(provider)}>
                              {t("common.edit")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => openModelCatalog(provider)}>
                              {t("relay.modelCatalog")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => fetchModelsMutation.mutate(provider.id)}>
                              {t("relay.fetchModels")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={!provider.enabled}
                              onSelect={() => setDeactivateTarget(provider)}
                            >
                              {t("relay.deactivate")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={() => setDeleteTarget(provider)}
                            >
                              {t("common.delete")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                );
              })}
              {!payload?.providers.length && (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                  {t("relay.empty")}
                </div>
              )}
              {(payload?.providers.length ?? 0) > 0 && filteredProviders.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                  {t("relay.noMatches")}
                </div>
              )}
            </div>
          )}
        </BentoCard>

        <Tabs defaultValue="provider" className="space-y-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="provider">{t("relay.currentProviderTab")}</TabsTrigger>
            <TabsTrigger value="system">{t("relay.systemStatusTab")}</TabsTrigger>
          </TabsList>
          <TabsContent value="provider" className="mt-0">
            <BentoCard compact>
              {selectedProvider ? (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {selectedProvider.id === activeRelayId ? (
                          <Route className="h-4 w-4 text-primary" />
                        ) : (
                          <Server className="h-4 w-4 text-muted-foreground" />
                        )}
                        <h3 className="truncate text-sm font-semibold">
                          {selectedProvider.name || selectedProvider.id}
                        </h3>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {selectedProvider.baseUrl || "-"}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDetailTarget(selectedProvider)}
                      disabled={busy}
                    >
                      <Eye />
                      {t("relay.detail")}
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge variant={selectedProvider.id === activeRelayId ? "default" : "secondary"} className="font-normal">
                      {selectedProvider.id === activeRelayId ? t("pilot.active") : t("pilot.inactive")}
                    </Badge>
                    <Badge variant={selectedProvider.enabled ? "secondary" : "outline"} className="font-normal">
                      {selectedProvider.enabled ? t("relay.enabled") : t("relay.disabled")}
                    </Badge>
                    <Badge variant="outline" className="font-normal">
                      {wireApiLabel(selectedProvider.wireApi)}
                    </Badge>
                    <Badge variant="outline" className="font-normal">
                      {selectedProvider.network === "system" ? t("relay.networkSystem") : t("relay.networkDirect")}
                    </Badge>
                    {selectedProvider.apiKeyStored && (
                      <Badge variant="secondary" className="font-normal">
                        {t("relay.keyStored")}
                      </Badge>
                    )}
                    <RelayHealthBadge provider={selectedProvider} />
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <DiagnosticMetric label={t("relay.providerId")} value={selectedProvider.id} />
                    <DiagnosticMetric label={t("relay.currentModel")} value={selectedProvider.model || "-"} />
                    <DiagnosticMetric
                      label={t("relay.latency")}
                      value={selectedProvider.latencyMs ? `${selectedProvider.latencyMs} ms` : "-"}
                    />
                    <DiagnosticMetric
                      label={t("relay.healthScore")}
                      value={selectedProvider.healthScore === null ? "-" : String(selectedProvider.healthScore)}
                    />
                    <DiagnosticMetric
                      label={t("relay.lastTest")}
                      value={selectedProvider.lastTestedAt ? formatDateTime(selectedProvider.lastTestedAt) : "-"}
                    />
                    <DiagnosticMetric
                      label={t("relay.modelCount")}
                      value={String(selectedProvider.models.length)}
                    />
                  </div>
                  {(selectedProvider.errorMessage || selectedProvider.lastError) && (
                    <div className="mt-3 rounded-[8px] border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                      <div className="font-medium">{t("relay.lastError")}</div>
                      <div className="mt-1 break-all">
                        {selectedProvider.errorMessage || selectedProvider.lastError}
                      </div>
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEdit(selectedProvider)}
                      disabled={busy}
                    >
                      {t("common.edit")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openModelCatalog(selectedProvider)}
                      disabled={busy}
                    >
                      <Layers3 />
                      {t("relay.modelCatalog")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchModelsMutation.mutate(selectedProvider.id)}
                      disabled={busy}
                    >
                      {fetchModelsMutation.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                      {t("relay.fetchModels")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testMutation.mutate(selectedProvider.id)}
                      disabled={busy}
                    >
                      {testMutation.isPending ? <Loader2 className="animate-spin" /> : <Network />}
                      {t("common.test")}
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          disabled={busy}
                          aria-label={t("relay.moreActions")}
                          title={t("relay.moreActions")}
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => setDeleteTarget(selectedProvider)}
                        >
                          {t("common.delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </>
              ) : (
                <div className="flex min-h-[240px] flex-col items-center justify-center text-center">
                  <Server className="h-8 w-8 text-muted-foreground/60" />
                  <div className="mt-2 text-sm font-medium">{t("relay.empty")}</div>
                  <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                    {t("relay.providersDesc")}
                  </p>
                </div>
              )}
            </BentoCard>
          </TabsContent>
          <TabsContent value="system" className="mt-0">
            <BentoCard compact>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Activity className="h-4 w-4 text-primary" />
                  {t("relay.diagnosticsPanel")}
                </div>
                <Badge
                  variant={diagnostics && diagnostics.issues.length > 0 ? "destructive" : "secondary"}
                  className="font-normal"
                >
                  {diagnostics && diagnostics.issues.length > 0
                    ? t("relay.needsAttention")
                    : t("relay.ready")}
                </Badge>
              </div>
              <Separator className="my-2" />
              <div className="grid gap-2">
                <RouteCheck
                  icon={<Route className="h-3.5 w-3.5" />}
                  label={t("relay.configHasRouter")}
                  ok={diagnostics?.configHasRouter ?? payload?.codexRouterEnabled ?? false}
                />
                <RouteCheck
                  icon={<FileWarning className="h-3.5 w-3.5" />}
                  label={t("relay.catalogExists")}
                  ok={diagnostics?.catalogExists ?? false}
                />
                <RouteCheck
                  icon={<Server className="h-3.5 w-3.5" />}
                  label={t("relay.activeProvider")}
                  ok={Boolean(routing?.activeProvider || activeProvider)}
                  value={routing?.activeProvider || activeProvider?.id || "-"}
                />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-1.5">
                <Button variant="outline" size="sm" onClick={() => diagnoseMutation.mutate()} disabled={busy}>
                  {diagnoseMutation.isPending ? <Loader2 className="animate-spin" /> : <Activity />}
                  {t("relay.diagnose")}
                </Button>
                <Button variant="outline" size="sm" onClick={requestRepair} disabled={busy}>
                  {repairMutation.isPending ? <Loader2 className="animate-spin" /> : <Wrench />}
                  {t("relay.repair")}
                </Button>
              </div>
              <Separator className="my-2" />
              <div className="flex items-center gap-2 text-sm font-semibold">
                <FileWarning className="h-4 w-4 text-primary" />
                {t("relay.managedFiles")}
              </div>
              <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                <PathLine label={t("relay.stateFile")} value={payload?.statePath} />
                <PathLine label={t("relay.configFile")} value={routing?.sourcePath ?? payload?.configPath} />
                <PathLine label={t("relay.catalogFile")} value={diagnostics?.catalogPath} />
              </div>
            </BentoCard>
          </TabsContent>
        </Tabs>
      </div>

      <ProviderDialog
        open={dialogOpen}
        form={form}
        recommendedStations={recommendedRelayStations}
        saving={upsertMutation.isPending}
        testing={draftTestMutation.isPending}
        fetchingModels={fetchDraftModelsMutation.isPending}
        draftModels={draftModels}
        draftTestResult={draftTestResult}
        onOpenChange={setDialogOpen}
        onFormChange={(nextForm) => {
          setForm(nextForm);
          if (nextForm.baseUrl !== form.baseUrl || nextForm.wireApi !== form.wireApi) {
            setDraftModels([]);
          }
        }}
        onFetchModels={() => fetchDraftModelsMutation.mutate(form)}
        onDraftTest={() => draftTestMutation.mutate(form)}
        onSave={saveProvider}
      />

      <DiagnosticsDialog
        open={diagnosticsOpen}
        diagnostics={diagnostics}
        onOpenChange={setDiagnosticsOpen}
      />

      <RelayProviderDetailDialog
        open={detailTarget !== null}
        provider={detailTarget}
        active={detailTarget?.id === activeRelayId}
        onOpenChange={(open) => !open && setDetailTarget(null)}
        onEdit={(provider) => {
          setDetailTarget(null);
          openEdit(provider);
        }}
      />

      <ModelCatalogDialog
        open={modelCatalogProvider !== null}
        provider={modelCatalogProvider}
        saving={updateModelMutation.isPending}
        refreshing={fetchModelsMutation.isPending}
        onOpenChange={(open) => !open && setModelCatalogTarget(null)}
        onRefresh={(provider) => fetchModelsMutation.mutate(provider.id)}
        onSelect={(provider, model) => updateModelMutation.mutate({ provider, model })}
      />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("relay.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("relay.deleteConfirmDesc", { provider: deleteTarget?.name || deleteTarget?.id || "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={routerConfirmOpen} onOpenChange={(open) => !open && setRouterConfirmOpen(false)}>
        <AlertDialogContent className="max-w-[560px]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {routerTargetEnabled ? t("relay.enableRouterConfirmTitle") : t("relay.disableRouterConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {routerTargetEnabled ? t("relay.enableRouterConfirmDesc") : t("relay.disableRouterConfirmDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ConfirmImpactList
            items={[
              t("relay.confirmImpactConfig"),
              t("relay.confirmImpactProfile"),
              routerTargetEnabled ? t("relay.confirmImpactRouteOn") : t("relay.confirmImpactRouteOff"),
            ]}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmToggleRouter}>
              {routerTargetEnabled ? t("relay.enableRouter") : t("relay.disableRouter")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={repairConfirmOpen} onOpenChange={(open) => !open && setRepairConfirmOpen(false)}>
        <AlertDialogContent className="max-w-[560px]">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("relay.repairConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("relay.repairConfirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <ConfirmImpactList
            items={[
              t("relay.confirmImpactState"),
              t("relay.confirmImpactCatalog"),
              t("relay.confirmImpactConfig"),
            ]}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRepair}>{t("relay.repair")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={importConfirmOpen} onOpenChange={(open) => !open && setImportConfirmOpen(false)}>
        <AlertDialogContent className="max-w-[560px]">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("relay.importConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("relay.importConfirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <ConfirmImpactList
            items={[
              t("relay.confirmImpactImportState"),
              t("relay.confirmImpactCatalog"),
              t("relay.confirmImpactProfile"),
            ]}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmImport}>{t("relay.import")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={exportConfirmOpen} onOpenChange={(open) => !open && setExportConfirmOpen(false)}>
        <AlertDialogContent className="max-w-[560px]">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("relay.exportConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("relay.exportConfirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <ConfirmImpactList
            items={[
              t("relay.confirmImpactExportFile"),
              t("relay.confirmImpactExportSecrets"),
              t("relay.confirmImpactCatalog"),
            ]}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmExport}>
              {exportMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("relay.export")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deactivateTarget !== null} onOpenChange={(open) => !open && setDeactivateTarget(null)}>
        <AlertDialogContent className="max-w-[560px]">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("relay.deactivateConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("relay.deactivateConfirmDesc", {
                provider: deactivateTarget?.name || deactivateTarget?.id || "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ConfirmImpactList
            items={[
              t("relay.confirmImpactProviderDisabled"),
              t("relay.confirmImpactCatalog"),
              t("relay.confirmImpactProfile"),
            ]}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-500 text-white hover:bg-amber-600"
              onClick={() => deactivateTarget && deactivateMutation.mutate(deactivateTarget.id)}
            >
              {deactivateMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("relay.deactivate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ConfirmImpactList({ items }: { items: string[] }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-[8px] border bg-muted/20 p-3">
      <div className="mb-2 text-xs font-medium text-foreground">{t("relay.confirmImpactTitle")}</div>
      <div className="grid gap-1.5 text-xs text-muted-foreground">
        {items.map((item) => (
          <div key={item} className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RelayProviderDetailDialog({
  open,
  provider,
  active,
  onOpenChange,
  onEdit,
}: {
  open: boolean;
  provider: RelayProvider | null;
  active: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (provider: RelayProvider) => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[720px] p-0">
        <DialogHeader>
          <div className="border-b border-border px-4 py-3.5">
            <DialogTitle>{t("relay.detailTitle")}</DialogTitle>
            <DialogDescription className="mt-1.5">
              {t("relay.detailDesc")}
            </DialogDescription>
          </div>
        </DialogHeader>
        {provider && (
          <div className="grid gap-3 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={active ? "default" : "secondary"} className="font-normal">
                {active ? t("pilot.active") : t("pilot.inactive")}
              </Badge>
              <Badge variant={provider.enabled ? "secondary" : "outline"} className="font-normal">
                {provider.enabled ? t("relay.enabled") : t("relay.disabled")}
              </Badge>
              <Badge variant="outline" className="font-normal">
                {wireApiLabel(provider.wireApi)}
              </Badge>
              <RelayHealthBadge provider={provider} />
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <DiagnosticMetric label={t("relay.providerId")} value={provider.id} />
              <DiagnosticMetric label={t("relay.providerName")} value={provider.name || provider.id} />
              <DiagnosticMetric label={t("relay.currentModel")} value={provider.model || "-"} />
              <DiagnosticMetric label={t("relay.network")} value={provider.network === "system" ? t("relay.networkSystem") : t("relay.networkDirect")} />
              <DiagnosticMetric label={t("relay.healthScore")} value={provider.healthScore === null ? "-" : String(provider.healthScore)} />
              <DiagnosticMetric label={t("relay.latency")} value={provider.latencyMs ? `${provider.latencyMs} ms` : "-"} />
              <DiagnosticMetric label={t("relay.lastTest")} value={provider.lastTestedAt ? formatDateTime(provider.lastTestedAt) : "-"} />
              <DiagnosticMetric label={t("relay.createdAt")} value={formatDateTime(provider.createdAt)} />
              <DiagnosticMetric label={t("relay.updatedAt")} value={formatDateTime(provider.updatedAt)} />
            </div>
            <div className="rounded-[8px] border bg-muted/20 p-3 text-xs">
              <div className="font-medium text-foreground">{t("pilot.baseUrl")}</div>
              <div className="mt-1 break-all font-mono text-muted-foreground">
                {provider.baseUrl || "-"}
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <div className="rounded-[8px] border bg-muted/20 p-3 text-xs">
                <div className="font-medium text-foreground">{t("relay.extraHeaders")}</div>
                <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-muted-foreground">
                  {Object.keys(provider.extraHeaders ?? {}).length
                    ? JSON.stringify(provider.extraHeaders, null, 2)
                    : "{}"}
                </pre>
              </div>
              <div className="rounded-[8px] border bg-muted/20 p-3 text-xs">
                <div className="font-medium text-foreground">{t("relay.models")}</div>
                <div className="mt-1 max-h-28 overflow-auto break-all font-mono text-[11px] text-muted-foreground">
                  {provider.models.length ? provider.models.join(", ") : "-"}
                </div>
              </div>
            </div>
            {(provider.errorMessage || provider.lastError) && (
              <div className="rounded-[8px] border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                <div className="font-medium">{t("relay.lastError")}</div>
                <div className="mt-1 break-all">{provider.errorMessage || provider.lastError}</div>
              </div>
            )}
          </div>
        )}
        <DialogFooter className="border-t border-border px-4 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.close")}
          </Button>
          <Button onClick={() => provider && onEdit(provider)} disabled={!provider}>
            {t("common.edit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModelCatalogDialog({
  open,
  provider,
  saving,
  refreshing,
  onOpenChange,
  onRefresh,
  onSelect,
}: {
  open: boolean;
  provider: RelayProvider | null;
  saving: boolean;
  refreshing: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh: (provider: RelayProvider) => void;
  onSelect: (provider: RelayProvider, model: string) => void;
}) {
  const { t } = useTranslation();
  const models = provider?.models ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[720px] p-0">
        <DialogHeader>
          <div className="border-b border-border px-4 py-3.5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle>{t("relay.modelCatalogTitle")}</DialogTitle>
                <DialogDescription className="mt-1.5">
                  {t("relay.modelCatalogDesc")}
                </DialogDescription>
              </div>
              <Badge variant="secondary" className="mr-6 shrink-0 font-normal">
                {models.length} {t("relay.modelCount")}
              </Badge>
            </div>
          </div>
        </DialogHeader>
        {provider ? (
          <div className="grid gap-3 px-4 py-3">
            <div className="grid gap-2.5 md:grid-cols-4">
              <DiagnosticMetric label={t("relay.providerName")} value={provider.name || provider.id} />
              <DiagnosticMetric label={t("relay.providerId")} value={provider.id} />
              <DiagnosticMetric label={t("relay.currentModel")} value={provider.model || "-"} />
              <DiagnosticMetric label={t("relay.wireApi")} value={wireApiLabel(provider.wireApi)} />
            </div>
            <div className="rounded-[8px] border bg-muted/20 px-3 py-2 text-xs">
              <div className="font-medium text-foreground">{t("pilot.baseUrl")}</div>
              <div className="mt-1 break-all font-mono text-muted-foreground">
                {provider.baseUrl || "-"}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                {models.length ? t("relay.modelCatalogRefreshHint") : t("relay.modelCatalogEmpty")}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onRefresh(provider)}
                disabled={refreshing || saving}
              >
                {refreshing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                {t("relay.fetchModels")}
              </Button>
            </div>
            {models.length ? (
              <ScrollArea className="max-h-[340px] rounded-[8px] border">
                <div className="grid gap-2 p-3 md:grid-cols-2">
                  {models.map((model) => {
                    const active = model === provider.model;
                    return (
                      <button
                        key={model}
                        type="button"
                        disabled={active || saving}
                        onClick={() => onSelect(provider, model)}
                        className={
                          active
                            ? "flex min-h-[58px] items-center justify-between gap-3 rounded-[8px] border border-primary bg-primary/10 px-3 py-2 text-left"
                            : "flex min-h-[58px] items-center justify-between gap-3 rounded-[8px] border bg-card px-3 py-2 text-left transition-colors hover:border-primary/50 hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-70"
                        }
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-mono text-xs font-medium">{model}</span>
                          <span className="mt-1 block text-[11px] text-muted-foreground">
                            {active ? t("relay.currentModel") : t("relay.selectModel")}
                          </span>
                        </span>
                        {active ? (
                          <Badge className="shrink-0 font-normal">{t("relay.currentModel")}</Badge>
                        ) : (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            ) : (
              <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[8px] border border-dashed bg-muted/20 text-center">
                <Layers3 className="h-8 w-8 text-muted-foreground/60" />
                <div className="mt-2 text-sm font-medium">{t("relay.modelCatalogEmpty")}</div>
                <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                  {t("relay.modelCatalogDesc")}
                </p>
              </div>
            )}
          </div>
        ) : null}
        <DialogFooter className="border-t border-border px-4 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProviderDialog({
  open,
  form,
  recommendedStations,
  saving,
  testing,
  fetchingModels,
  draftModels,
  draftTestResult,
  onOpenChange,
  onFormChange,
  onFetchModels,
  onDraftTest,
  onSave,
}: {
  open: boolean;
  form: RelayProviderForm;
  recommendedStations: RecommendedRelayStation[];
  saving: boolean;
  testing: boolean;
  fetchingModels: boolean;
  draftModels: string[];
  draftTestResult: { ok: boolean; message: string; providerId: string } | null;
  onOpenChange: (open: boolean) => void;
  onFormChange: (form: RelayProviderForm) => void;
  onFetchModels: () => void;
  onDraftTest: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const [recommendedOpen, setRecommendedOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selectedStation, setSelectedStation] = useState<RecommendedRelayStation | null>(null);

  useEffect(() => {
    if (open) {
      setAdvancedOpen(false);
      return;
    }
    setAdvancedOpen(false);
    setRecommendedOpen(false);
    setSelectedStation(null);
  }, [open]);

  const fillStation = (station: RecommendedRelayStation) => {
    if (station.placeholder) return;
    onFormChange({
      ...form,
      id: station.id,
      name: station.name,
      baseUrl: station.baseUrl,
      apiKey: "",
    });
  };

  const selectStation = (station: RecommendedRelayStation) => {
    setSelectedStation(station);
    setRecommendedOpen(true);
  };

  const applyStation = (station: RecommendedRelayStation) => {
    if (station.placeholder) return;
    fillStation(station);
    setSelectedStation(null);
    setRecommendedOpen(false);
    toast({
      title: t("relay.recommendedApplied"),
      description: t("relay.recommendedAppliedDesc", { station: station.name }),
    });
  };

  const applyModelPreset = (preset: (typeof RELAY_MODEL_PRESETS)[number]) => {
    onFormChange({
      ...form,
      model: preset.model,
      wireApi: preset.wireApi,
    });
    toast({
      title: t("relay.modelPresetApplied"),
      description: t("relay.modelPresetAppliedDesc", { model: preset.model }),
    });
  };

  const applyProviderPreset = (preset: (typeof RELAY_PROVIDER_PRESETS)[number]) => {
    onFormChange({
      ...form,
      id: preset.id,
      name: preset.name,
      baseUrl: preset.baseUrl,
      apiKey: "",
      model: preset.model,
      wireApi: preset.wireApi,
      network: preset.network,
      extraHeaders: "",
    });
    toast({
      title: t("relay.providerPresetApplied"),
      description: t("relay.providerPresetAppliedDesc", { provider: preset.name }),
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[860px] p-0">
        <DialogHeader>
          <div className="border-b border-border px-4 py-3.5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle>{t("relay.providerDialogTitle")}</DialogTitle>
                <DialogDescription className="mt-1.5">
                  {t("relay.providerDialogDesc")}
                </DialogDescription>
              </div>
              <Badge variant="secondary" className="shrink-0 font-normal">
                Codex Router
              </Badge>
            </div>
          </div>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh]">
          <div className="grid gap-3 px-4 py-3">
            <DialogSection
              icon={<Route className="h-4 w-4" />}
              title={t("relay.providerPresets")}
              desc={t("relay.providerPresetsDesc")}
            >
              <div className="grid gap-2 md:grid-cols-4">
                {RELAY_PROVIDER_PRESETS.slice(0, 4).map((preset) => (
                  <PresetButton
                    key={preset.id}
                    active={form.id === preset.id}
                    title={preset.name}
                    desc={preset.baseUrl}
                    onClick={() => applyProviderPreset(preset)}
                  />
                ))}
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    {t("relay.recommendedStations")}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {t("relay.recommendedStationsDesc")}
                  </div>
                </div>
                <div className="grid gap-2 md:grid-cols-4">
                  {recommendedStations.length ? (
                    recommendedStations.slice(0, 4).map((station) => (
                      <button
                        key={station.id}
                        type="button"
                        className={cn(
                          "min-h-[68px] rounded-[8px] border px-3 py-2 text-left transition-colors hover:border-primary/50 hover:bg-muted/40",
                          selectedStation?.id === station.id && "border-primary bg-primary/10",
                        )}
                        onClick={() => selectStation(station)}
                      >
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-sm font-medium">{station.name}</span>
                          {station.promoCode && (
                            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal">
                              {station.promoCode}
                            </Badge>
                          )}
                          {station.placeholder && (
                            <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">
                              {t("relay.sponsorSlot")}
                            </Badge>
                          )}
                        </span>
                        <span className="mt-1 block line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                          {station.placeholder ? station.description : station.baseUrl}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="rounded-[8px] border border-dashed px-3 py-2 text-xs text-muted-foreground md:col-span-4">
                      {t("relay.recommendedStationsDesc")}
                    </div>
                  )}
                </div>
              </div>
            </DialogSection>

            <DialogSection
              icon={<Network className="h-4 w-4" />}
              title={t("relay.endpointTitle")}
              desc={t("relay.endpointDesc")}
            >
              <div className="grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px_180px]">
                <div className="grid gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("relay.wireApi")}</label>
                  <Select value={form.wireApi} onValueChange={(wireApi) => onFormChange({ ...form, wireApi })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="responses">OpenAI Responses</SelectItem>
                      <SelectItem value="anthropic">Anthropic Messages</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <LabeledInput label={t("pilot.baseUrl")} value={form.baseUrl} onChange={(value) => onFormChange({ ...form, baseUrl: value })} placeholder="https://api.example.com/v1" />
                <LabeledInput label={t("relay.providerId")} value={form.id} onChange={(value) => onFormChange({ ...form, id: value })} placeholder="pptoken" />
                <LabeledInput label={t("relay.providerName")} value={form.name} onChange={(value) => onFormChange({ ...form, name: value })} placeholder={t("relay.providerNamePlaceholder")} />
              </div>
              <div className="grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px]">
                <LabeledInput label={t("relay.apiKey")} value={form.apiKey} onChange={(value) => onFormChange({ ...form, apiKey: value })} type="password" placeholder={t("relay.apiKeyPlaceholder")} />
                <LabeledInput label={t("relay.modelId")} value={form.model} onChange={(value) => onFormChange({ ...form, model: value })} placeholder="gpt-5.5, gpt-4.1" />
                <div className="grid gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("relay.network")}</label>
                  <Select value={form.network} onValueChange={(network) => onFormChange({ ...form, network })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="direct">{t("relay.networkDirect")}</SelectItem>
                      <SelectItem value="system">{t("relay.networkSystem")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onFetchModels}
                  disabled={fetchingModels || testing || saving || !form.baseUrl.trim()}
                >
                  {fetchingModels ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                  {t("relay.fetchModels")}
                </Button>
                {RELAY_MODEL_PRESETS.map((preset) => (
                  <Button
                    key={preset.id}
                    type="button"
                    variant={form.model === preset.model ? "default" : "outline"}
                    size="xs"
                    onClick={() => applyModelPreset(preset)}
                  >
                    {preset.label}
                  </Button>
                ))}
                {draftModels.length > 0 && (
                  <Badge variant="secondary" className="font-normal">
                    {t("relay.modelsFetchedDesc", { count: draftModels.length })}
                  </Badge>
                )}
              </div>
              {draftModels.length > 0 && (
                <div className="grid max-h-32 gap-1.5 overflow-y-auto rounded-[8px] border bg-card p-2 sm:grid-cols-2 lg:grid-cols-3">
                  {draftModels.slice(0, 36).map((model) => (
                    <button
                      key={model}
                      type="button"
                      onClick={() => onFormChange({ ...form, model })}
                      className={cn(
                        "truncate rounded-[6px] border px-2 py-1.5 text-left font-mono text-xs transition-colors",
                        form.model === model
                          ? "border-primary bg-primary/10 text-primary"
                          : "bg-background hover:border-primary/50 hover:bg-muted/50",
                      )}
                      title={model}
                    >
                      {model}
                    </button>
                  ))}
                </div>
              )}
            </DialogSection>

            <section className="rounded-[8px] border bg-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Activity className="h-4 w-4 text-primary" />
                    {t("relay.preflightTitle")}
                  </div>
                  <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {draftTestResult
                      ? t(draftTestResult.ok ? "relay.preflightPassed" : "relay.preflightFailed", {
                          provider: draftTestResult.providerId,
                        })
                      : t("relay.preflightPending")}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAdvancedOpen((current) => !current)}
                  >
                    {advancedOpen ? <ChevronUp /> : <ChevronDown />}
                    {advancedOpen ? t("relay.hideAdvancedOptions") : t("relay.advancedOptions")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onDraftTest}
                    disabled={testing || saving}
                  >
                    {testing ? <Loader2 className="animate-spin" /> : <Network />}
                    {t("relay.testDraft")}
                  </Button>
                </div>
              </div>
              {draftTestResult && (
                <div
                  className={cn(
                    "mt-2 rounded-[8px] border px-3 py-2 text-xs",
                    draftTestResult.ok
                      ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
                      : "border-destructive/30 bg-destructive/5 text-destructive",
                  )}
                >
                  {draftTestResult.message}
                </div>
              )}
              {advancedOpen && (
                <div className="mt-3 grid gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("relay.extraHeadersTitle")}</label>
                  <Textarea
                    value={form.extraHeaders}
                    onChange={(event) => onFormChange({ ...form, extraHeaders: event.target.value })}
                    placeholder='{"x-api-key":"...","anthropic-version":"2023-06-01"}'
                    className="min-h-[78px] font-mono text-xs"
                  />
                  <div className="text-[11px] text-muted-foreground">{t("relay.extraHeadersDesc")}</div>
                </div>
              )}
            </section>
          </div>
        </ScrollArea>
        <DialogFooter className="border-t border-border px-4 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            {t("relay.saveProvider")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

      <RecommendedStationsDialog
        open={recommendedOpen}
        selectedStation={selectedStation}
        onOpenChange={(nextOpen) => {
          setRecommendedOpen(nextOpen);
          if (!nextOpen) setSelectedStation(null);
        }}
        onApply={applyStation}
      />
    </>
  );
}

function RecommendedStationsDialog({
  open,
  selectedStation,
  onOpenChange,
  onApply,
}: {
  open: boolean;
  selectedStation: RecommendedRelayStation | null;
  onOpenChange: (open: boolean) => void;
  onApply: (station: RecommendedRelayStation) => void;
}) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px] p-0">
        <DialogHeader>
          <div className="border-b border-border px-4 py-3.5">
            <DialogTitle>{t("relay.recommendedStationsTitle")}</DialogTitle>
            <DialogDescription className="mt-1.5">
              {t("relay.recommendedStationsDialogDesc")}
            </DialogDescription>
          </div>
        </DialogHeader>
        <div className="grid gap-3 px-4 py-3">
          {selectedStation ? (
            <div className="rounded-[8px] border bg-card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold">{selectedStation.name}</h3>
                {selectedStation.promoCode && (
                  <Badge variant="secondary" className="font-normal">
                    {t("relay.promoCode")}: {selectedStation.promoCode}
                  </Badge>
                )}
                {selectedStation.placeholder && (
                  <Badge variant="outline" className="font-normal">
                    {t("relay.sponsorSlot")}
                  </Badge>
                )}
              </div>
              <div className="mt-2 max-h-32 overflow-y-auto whitespace-pre-line pr-1 text-xs leading-5 text-muted-foreground">
                {selectedStation.description}
              </div>
              {!selectedStation.placeholder && selectedStation.registerUrl && (
                <div className="mt-3 rounded-[8px] border bg-muted/20 p-2.5 text-xs">
                  <div className="text-[11px] font-medium text-muted-foreground">
                    {t("relay.exclusiveRegisterUrl")}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void import("@tauri-apps/plugin-shell")
                        .then(({ open }) => open(selectedStation.registerUrl))
                        .catch((err) => toastError(t("relay.openRegisterFailed"), err));
                    }}
                    className="mt-1 inline-flex w-full items-center gap-1.5 text-left text-xs text-primary underline-offset-4 hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    <span className="break-all">{selectedStation.registerUrl}</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex min-h-[180px] flex-col items-center justify-center text-center">
              <Sparkles className="h-7 w-7 text-muted-foreground/60" />
              <div className="mt-2 text-sm font-medium">{t("relay.chooseRecommendedStation")}</div>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                {t("relay.chooseRecommendedStationDesc")}
              </p>
            </div>
          )}
        </div>
        <DialogFooter className="border-t border-border px-4 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.close")}
          </Button>
          <Button
            disabled={!selectedStation || selectedStation.placeholder}
            onClick={() => selectedStation && onApply(selectedStation)}
          >
            {t("relay.useRecommendedStation")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DiagnosticsDialog({
  open,
  diagnostics,
  onOpenChange,
}: {
  open: boolean;
  diagnostics: RelayRouteDiagnosticPayload | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const ok = diagnostics ? diagnostics.issues.length === 0 : false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("relay.diagnosticsTitle")}</DialogTitle>
          <DialogDescription>
            {ok ? t("relay.diagnosticsOk") : t("relay.diagnosticsNeedsAttention")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-3 md:grid-cols-2">
            <DiagnosticMetric label={t("relay.routerStatus")} value={diagnostics?.routerEnabled ? t("relay.enabled") : t("relay.disabled")} />
            <DiagnosticMetric label={t("relay.proxyStatus")} value={diagnostics?.proxyRunning ? t("relay.proxyRunning") : t("relay.proxyStopped")} />
            <DiagnosticMetric label={t("relay.activeProvider")} value={diagnostics?.activeProvider || "-"} />
            <DiagnosticMetric label={t("relay.activeModel")} value={diagnostics?.activeModel || "-"} />
            <DiagnosticMetric label={t("relay.configHasRouter")} value={diagnostics?.configHasRouter ? t("common.confirm") : "-"} />
            <DiagnosticMetric label={t("relay.catalogExists")} value={diagnostics?.catalogExists ? t("common.confirm") : "-"} />
          </div>
          <Separator />
          <ScrollArea className="max-h-56 rounded-[8px] border bg-muted/30 p-3">
            <div className="space-y-3 text-xs">
              <DiagnosticList title={t("relay.issues")} items={diagnostics?.issues ?? []} empty={t("relay.noIssues")} />
              <DiagnosticList title={t("relay.suggestions")} items={diagnostics?.suggestions ?? []} empty={t("relay.noSuggestions")} />
            </div>
          </ScrollArea>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>{t("common.close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusCard({
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
  tone: "ok" | "muted";
}) {
  return (
    <BentoCard compact className="min-h-[58px]">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className={tone === "ok" ? "text-primary" : "text-muted-foreground"}>{icon}</span>
        {label}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <div className="truncate text-base font-semibold">{value}</div>
        {detail && <div className="truncate text-[11px] text-muted-foreground">{detail}</div>}
      </div>
    </BentoCard>
  );
}

function RelayHealthBadge({ provider }: { provider: RelayProvider }) {
  const { t } = useTranslation();
  if (provider.errorMessage || provider.lastError) {
    return (
      <Badge variant="outline" className="border-destructive/40 text-destructive font-normal">
        {t("relay.healthFailed")}
      </Badge>
    );
  }
  if (provider.healthScore !== null && provider.healthScore >= 80) {
    return (
      <Badge variant="secondary" className="font-normal">
        {t("relay.healthOk")}
      </Badge>
    );
  }
  if (provider.lastTestedAt) {
    return (
      <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400 font-normal">
        {t("relay.healthWarn")}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="font-normal">
      {t("relay.healthPending")}
    </Badge>
  );
}

function DialogSection({
  icon,
  title,
  desc,
  children,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[8px] border bg-card p-3">
      <div className="mb-3 flex items-start gap-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-primary/10 text-primary">
          {icon}
        </div>
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{desc}</div>
        </div>
      </div>
      <div className="grid gap-2.5">{children}</div>
    </section>
  );
}

function PresetButton({
  active,
  title,
  desc,
  onClick,
}: {
  active: boolean;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-[58px] rounded-[8px] border px-3 py-2 text-left transition-colors hover:border-primary/50 hover:bg-muted/40",
        active && "border-primary bg-primary/10",
      )}
    >
      <span className="block truncate text-sm font-medium">{title}</span>
      <span className="mt-1 block truncate text-[11px] leading-4 text-muted-foreground">
        {desc}
      </span>
    </button>
  );
}

function RouteCheck({
  icon,
  label,
  ok,
  value,
}: {
  icon: ReactNode;
  label: string;
  ok: boolean;
  value?: string;
}) {
  return (
    <div className="flex items-start gap-2 rounded-[8px] border bg-muted/20 px-3 py-2">
      <span className={ok ? "text-emerald-500" : "text-amber-500"}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        {value && <div className="truncate text-xs font-medium text-foreground">{value}</div>}
      </div>
    </div>
  );
}

function DiagnosticMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border bg-muted/30 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-medium">{value}</div>
    </div>
  );
}

function DiagnosticList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div>
      <div className="mb-1 font-medium">{title}</div>
      {items.length ? (
        <ul className="space-y-1 text-muted-foreground">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <div className="text-muted-foreground">{empty}</div>
      )}
    </div>
  );
}

function PathLine({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="font-medium text-foreground">{label}</div>
      <div className="mt-1 break-all font-mono text-[11px]">{value || "-"}</div>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
      />
    </div>
  );
}

function wireApiLabel(value: string) {
  if (value === "responses" || value === "openai-responses" || value === "openai-chat") return "OpenAI Responses";
  if (value === "anthropic") return "Anthropic Messages";
  return "OpenAI Responses";
}

function toastError(title: string, error: unknown) {
  toast({
    title,
    description: error instanceof Error ? error.message : String(error),
    variant: "destructive",
  });
}
