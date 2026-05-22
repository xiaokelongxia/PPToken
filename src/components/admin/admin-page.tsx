import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Blocks, Gift, MessageCircle, Plus, Save, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format-time";
import { toast } from "@/hooks/use-toast";
import type {
  AdminContentFile,
  AdminMessage,
  AdminMysteryCode,
  AdminNotification,
  AdminPluginCatalogItem,
  AdminRelayStation,
} from "@/types";
import { Badge } from "@/components/ui/badge";
import { BentoCard } from "@/components/ui/bento-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SegmentedOptions } from "@/components/ui/segmented-options";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type AdminTab = "relay" | "plugins" | "topbar" | "feedback";

export function AdminPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<AdminTab>("relay");
  const [draft, setDraft] = useState<AdminContentFile | null>(null);

  const query = useQuery({
    queryKey: ["admin-content"],
    queryFn: () => api.loadAdminContent(),
  });

  useEffect(() => {
    if (query.data?.data.content) {
      setDraft(cloneContent(query.data.data.content));
    }
  }, [query.data?.data.updatedAt]);

  const saveMutation = useMutation({
    mutationFn: (content: AdminContentFile) => api.saveAdminContent(content),
    onSuccess: (res) => {
      setDraft(cloneContent(res.data.content));
      queryClient.invalidateQueries({ queryKey: ["admin-content"] });
      queryClient.invalidateQueries({ queryKey: ["plugin-state"] });
      toast({
        title: t("admin.saved"),
        description: t("admin.savedDesc"),
        variant: "success",
      });
    },
  });

  const stats = useMemo(() => {
    const content = draft;
    return {
      relays: content?.relayStations.filter((item) => item.enabled).length ?? 0,
      plugins: content?.pluginCatalog.filter((item) => item.enabled).length ?? 0,
      notices: content?.topbar.notifications.filter((item) => item.enabled).length ?? 0,
      feedback: content?.feedbackItems.length ?? 0,
    };
  }, [draft]);

  if (!draft) {
    return (
      <BentoCard className="flex min-h-[220px] items-center justify-center text-sm text-muted-foreground">
        {query.isError ? t("admin.loadFailed") : t("common.loading")}
      </BentoCard>
    );
  }

  const updateDraft = (updater: (content: AdminContentFile) => AdminContentFile) => {
    setDraft((current) => (current ? updater(cloneContent(current)) : current));
  };

  const save = () => saveMutation.mutate(draft);

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-xl text-xs leading-snug text-muted-foreground">
          {t("admin.description")}
        </p>
        <div className="flex items-center gap-1.5">
          <SegmentedOptions
            items={[
              { value: "relay", label: t("admin.relayTab") },
              { value: "plugins", label: t("admin.pluginsTab") },
              { value: "topbar", label: t("admin.topbarTab") },
              { value: "feedback", label: t("admin.feedbackTab") },
            ]}
            value={tab}
            onChange={(value) => setTab(value as AdminTab)}
          />
          <Button size="sm" onClick={save} disabled={saveMutation.isPending}>
            <Save />
            {t("common.save")}
          </Button>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-4">
        <Metric label={t("admin.enabledRelays")} value={stats.relays} />
        <Metric label={t("admin.enabledPlugins")} value={stats.plugins} />
        <Metric label={t("admin.enabledNotices")} value={stats.notices} />
        <Metric label={t("admin.feedbackCount")} value={stats.feedback} />
      </div>

      {tab === "relay" && <RelayAdmin content={draft} updateDraft={updateDraft} />}
      {tab === "plugins" && <PluginAdmin content={draft} updateDraft={updateDraft} />}
      {tab === "topbar" && <TopbarAdmin content={draft} updateDraft={updateDraft} />}
      {tab === "feedback" && <FeedbackAdmin content={draft} updateDraft={updateDraft} />}

      <p className="text-[11px] text-muted-foreground">
        {t("admin.sourcePath", {
          path: query.data?.data.sourcePath ?? "",
          time: formatDateTime(draft.updatedAt),
        })}
      </p>
    </div>
  );
}

function RelayAdmin({
  content,
  updateDraft,
}: {
  content: AdminContentFile;
  updateDraft: (updater: (content: AdminContentFile) => AdminContentFile) => void;
}) {
  const { t } = useTranslation();
  const sorted = [...content.relayStations].sort((a, b) => a.sortOrder - b.sortOrder);

  const updateItem = (id: string, patch: Partial<AdminRelayStation>) => {
    updateDraft((draft) => ({
      ...draft,
      relayStations: draft.relayStations.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    }));
  };

  return (
    <BentoCard className="p-0">
      <SectionHeader
        icon={<MessageCircle className="h-4 w-4" />}
        title={t("admin.relayTitle")}
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              updateDraft((draft) => ({
                ...draft,
                relayStations: [
                  ...draft.relayStations,
                  {
                    id: `relay-${Date.now()}`,
                    name: t("admin.newRelay"),
                    baseUrl: "",
                    registerUrl: "",
                    promoCode: null,
                    description: "",
                    placeholder: false,
                    enabled: true,
                    sortOrder: nextSortOrder(draft.relayStations),
                  },
                ],
              }))
            }
          >
            <Plus />
            {t("admin.add")}
          </Button>
        }
      />
      <div className="divide-y divide-border">
        {sorted.map((item) => (
          <div key={item.id} className="grid gap-2 px-3.5 py-3 lg:grid-cols-[150px_minmax(0,1fr)_140px]">
            <div className="flex items-center gap-2">
              <Switch checked={item.enabled} onCheckedChange={(enabled) => updateItem(item.id, { enabled })} />
              <div className="min-w-0">
                <Input value={item.name} onChange={(event) => updateItem(item.id, { name: event.target.value })} className="h-8 text-sm font-medium" />
                <div className="mt-1 flex gap-1">
                  <Badge variant={item.placeholder ? "outline" : "secondary"}>{item.placeholder ? t("admin.placeholder") : t("admin.live")}</Badge>
                </div>
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <Input value={item.baseUrl} onChange={(event) => updateItem(item.id, { baseUrl: event.target.value })} placeholder="https://api.example.com/v1" className="h-8 text-xs" />
              <Input value={item.registerUrl} onChange={(event) => updateItem(item.id, { registerUrl: event.target.value })} placeholder={t("admin.registerUrl")} className="h-8 text-xs" />
              <Input value={item.promoCode ?? ""} onChange={(event) => updateItem(item.id, { promoCode: event.target.value || null })} placeholder={t("admin.promoCode")} className="h-8 text-xs" />
              <Input type="number" value={item.sortOrder} onChange={(event) => updateItem(item.id, { sortOrder: Number(event.target.value) })} placeholder={t("admin.sortOrder")} className="h-8 text-xs" />
              <Textarea value={item.description} onChange={(event) => updateItem(item.id, { description: event.target.value })} placeholder={t("admin.descriptionField")} className="h-[58px] max-h-[58px] resize-none overflow-auto text-xs md:col-span-2" />
            </div>
            <div className="flex flex-wrap items-start justify-end gap-1.5">
              <Button size="sm" variant="outline" onClick={() => updateItem(item.id, { placeholder: !item.placeholder })}>
                {item.placeholder ? t("admin.setLive") : t("admin.setPlaceholder")}
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() =>
                  updateDraft((draft) => ({
                    ...draft,
                    relayStations: draft.relayStations.filter((station) => station.id !== item.id),
                  }))
                }
              >
                <Trash2 />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </BentoCard>
  );
}

function PluginAdmin({
  content,
  updateDraft,
}: {
  content: AdminContentFile;
  updateDraft: (updater: (content: AdminContentFile) => AdminContentFile) => void;
}) {
  const { t } = useTranslation();
  const sorted = [...content.pluginCatalog].sort((a, b) => a.sortOrder - b.sortOrder);
  const updateItem = (id: string, patch: Partial<AdminPluginCatalogItem>) => {
    updateDraft((draft) => ({
      ...draft,
      pluginCatalog: draft.pluginCatalog.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    }));
  };

  return (
    <BentoCard className="p-0">
      <SectionHeader
        icon={<Blocks className="h-4 w-4" />}
        title={t("admin.pluginTitle")}
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              updateDraft((draft) => ({
                ...draft,
                pluginCatalog: [
                  ...draft.pluginCatalog,
                  {
                    id: `plugin-${Date.now()}`,
                    name: "",
                    displayName: t("admin.newPlugin"),
                    description: "",
                    category: "Custom",
                    version: null,
                    sourceUrl: null,
                    installCommand: null,
                    enabled: true,
                    sortOrder: nextSortOrder(draft.pluginCatalog),
                  },
                ],
              }))
            }
          >
            <Plus />
            {t("admin.add")}
          </Button>
        }
      />
      <div className="divide-y divide-border">
        {sorted.map((item) => (
          <div key={item.id} className="grid gap-2 px-3.5 py-3 lg:grid-cols-[180px_minmax(0,1fr)_48px]">
            <div className="flex items-center gap-2">
              <Switch checked={item.enabled} onCheckedChange={(enabled) => updateItem(item.id, { enabled })} />
              <div className="grid min-w-0 flex-1 gap-1">
                <Input value={item.displayName} onChange={(event) => updateItem(item.id, { displayName: event.target.value })} className="h-8 text-sm font-medium" />
                <Input value={item.name} onChange={(event) => updateItem(item.id, { name: event.target.value })} placeholder={t("admin.pluginName")} className="h-7 text-xs" />
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <Input value={item.category} onChange={(event) => updateItem(item.id, { category: event.target.value })} placeholder={t("admin.category")} className="h-8 text-xs" />
              <Input value={item.version ?? ""} onChange={(event) => updateItem(item.id, { version: event.target.value || null })} placeholder={t("admin.version")} className="h-8 text-xs" />
              <Input type="number" value={item.sortOrder} onChange={(event) => updateItem(item.id, { sortOrder: Number(event.target.value) })} placeholder={t("admin.sortOrder")} className="h-8 text-xs" />
              <Input value={item.sourceUrl ?? ""} onChange={(event) => updateItem(item.id, { sourceUrl: event.target.value || null })} placeholder={t("admin.sourceUrl")} className="h-8 text-xs md:col-span-2" />
              <Input value={item.installCommand ?? ""} onChange={(event) => updateItem(item.id, { installCommand: event.target.value || null })} placeholder={t("admin.installCommand")} className="h-8 text-xs" />
              <Textarea value={item.description} onChange={(event) => updateItem(item.id, { description: event.target.value })} placeholder={t("admin.descriptionField")} className="h-[58px] max-h-[58px] resize-none overflow-auto text-xs md:col-span-3" />
            </div>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() =>
                updateDraft((draft) => ({
                  ...draft,
                  pluginCatalog: draft.pluginCatalog.filter((plugin) => plugin.id !== item.id),
                }))
              }
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>
    </BentoCard>
  );
}

function TopbarAdmin({
  content,
  updateDraft,
}: {
  content: AdminContentFile;
  updateDraft: (updater: (content: AdminContentFile) => AdminContentFile) => void;
}) {
  const { t } = useTranslation();
  const topbar = content.topbar;

  const updateTopbar = (patch: Partial<AdminContentFile["topbar"]>) => {
    updateDraft((draft) => ({ ...draft, topbar: { ...draft.topbar, ...patch } }));
  };

  return (
    <div className="grid gap-2 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <BentoCard>
        <PanelTitle icon={<MessageCircle className="h-4 w-4" />} title={t("admin.feedbackSettings")} />
        <div className="mt-3 grid gap-2">
          <Input value={topbar.feedback.title} onChange={(event) => updateTopbar({ feedback: { ...topbar.feedback, title: event.target.value } })} className="h-8 text-xs" />
          <Input value={topbar.feedback.description} onChange={(event) => updateTopbar({ feedback: { ...topbar.feedback, description: event.target.value } })} className="h-8 text-xs" />
          <Input value={topbar.feedback.placeholder} onChange={(event) => updateTopbar({ feedback: { ...topbar.feedback, placeholder: event.target.value } })} className="h-8 text-xs" />
          <Input value={topbar.feedback.submitLabel} onChange={(event) => updateTopbar({ feedback: { ...topbar.feedback, submitLabel: event.target.value } })} className="h-8 text-xs" />
        </div>
      </BentoCard>

      <BentoCard>
        <PanelTitle icon={<Gift className="h-4 w-4" />} title={t("admin.mysterySettings")} />
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <Input value={topbar.mystery.title} onChange={(event) => updateTopbar({ mystery: { ...topbar.mystery, title: event.target.value } })} className="h-8 text-xs" />
          <Input value={topbar.mystery.verifyLabel} onChange={(event) => updateTopbar({ mystery: { ...topbar.mystery, verifyLabel: event.target.value } })} className="h-8 text-xs" />
          <Input value={topbar.mystery.description} onChange={(event) => updateTopbar({ mystery: { ...topbar.mystery, description: event.target.value } })} className="h-8 text-xs md:col-span-2" />
          <Input value={topbar.mystery.placeholder} onChange={(event) => updateTopbar({ mystery: { ...topbar.mystery, placeholder: event.target.value } })} className="h-8 text-xs" />
          <Input value={topbar.mystery.invalidTitle} onChange={(event) => updateTopbar({ mystery: { ...topbar.mystery, invalidTitle: event.target.value } })} className="h-8 text-xs" />
          <Input value={topbar.mystery.invalidMessage} onChange={(event) => updateTopbar({ mystery: { ...topbar.mystery, invalidMessage: event.target.value } })} className="h-8 text-xs md:col-span-2" />
        </div>
        <EditableCodeList codes={topbar.mystery.codes} updateDraft={updateDraft} />
      </BentoCard>

      <EditableNoticeList content={content} updateDraft={updateDraft} />
      <EditableMessageList content={content} updateDraft={updateDraft} />
    </div>
  );
}

function EditableCodeList({
  codes,
  updateDraft,
}: {
  codes: AdminMysteryCode[];
  updateDraft: (updater: (content: AdminContentFile) => AdminContentFile) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{t("admin.codes")}</span>
        <Button
          size="xs"
          variant="outline"
          onClick={() =>
            updateDraft((draft) => ({
              ...draft,
              topbar: {
                ...draft.topbar,
                mystery: {
                  ...draft.topbar.mystery,
                  codes: [
                    ...draft.topbar.mystery.codes,
                    {
                      id: `code-${Date.now()}`,
                      code: "",
                      title: t("admin.codeMatched"),
                      message: "",
                      enabled: true,
                    },
                  ],
                },
              },
            }))
          }
        >
          <Plus />
          {t("admin.add")}
        </Button>
      </div>
      {codes.map((item) => (
        <div key={item.id} className="grid gap-1.5 rounded-[8px] border bg-muted/20 p-2 md:grid-cols-[auto_1fr_1fr_1fr_auto]">
          <Switch
            checked={item.enabled}
            onCheckedChange={(enabled) => patchMysteryCode(updateDraft, item.id, { enabled })}
          />
          <Input value={item.code} onChange={(event) => patchMysteryCode(updateDraft, item.id, { code: event.target.value })} placeholder={t("admin.code")} className="h-7 text-xs" />
          <Input value={item.title} onChange={(event) => patchMysteryCode(updateDraft, item.id, { title: event.target.value })} placeholder={t("admin.title")} className="h-7 text-xs" />
          <Input value={item.message} onChange={(event) => patchMysteryCode(updateDraft, item.id, { message: event.target.value })} placeholder={t("admin.message")} className="h-7 text-xs" />
          <Button size="icon-sm" variant="ghost" onClick={() => removeMysteryCode(updateDraft, item.id)}>
            <Trash2 />
          </Button>
        </div>
      ))}
    </div>
  );
}

function EditableNoticeList({
  content,
  updateDraft,
}: {
  content: AdminContentFile;
  updateDraft: (updater: (content: AdminContentFile) => AdminContentFile) => void;
}) {
  const { t } = useTranslation();
  return (
    <BentoCard>
      <PanelTitle
        icon={<Bell className="h-4 w-4" />}
        title={t("admin.notifications")}
        action={
          <Button
            size="xs"
            variant="outline"
            onClick={() =>
              updateDraft((draft) => ({
                ...draft,
                topbar: {
                  ...draft.topbar,
                  notifications: [
                    ...draft.topbar.notifications,
                    {
                      id: `notice-${Date.now()}`,
                      title: t("admin.newNotice"),
                      body: "",
                      level: "info",
                      enabled: true,
                      sortOrder: nextSortOrder(draft.topbar.notifications),
                    },
                  ],
                },
              }))
            }
          >
            <Plus />
            {t("admin.add")}
          </Button>
        }
      />
      <div className="mt-3 space-y-2">
        {content.topbar.notifications.map((item) => (
          <div key={item.id} className="grid gap-1.5 rounded-[8px] border bg-muted/20 p-2 md:grid-cols-[auto_1fr_1fr_82px_auto]">
            <Switch checked={item.enabled} onCheckedChange={(enabled) => patchNotification(updateDraft, item.id, { enabled })} />
            <Input value={item.title} onChange={(event) => patchNotification(updateDraft, item.id, { title: event.target.value })} className="h-7 text-xs" />
            <Input value={item.body} onChange={(event) => patchNotification(updateDraft, item.id, { body: event.target.value })} className="h-7 text-xs" />
            <Input value={item.level} onChange={(event) => patchNotification(updateDraft, item.id, { level: event.target.value })} className="h-7 text-xs" />
            <Button size="icon-sm" variant="ghost" onClick={() => removeNotification(updateDraft, item.id)}>
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>
    </BentoCard>
  );
}

function EditableMessageList({
  content,
  updateDraft,
}: {
  content: AdminContentFile;
  updateDraft: (updater: (content: AdminContentFile) => AdminContentFile) => void;
}) {
  const { t } = useTranslation();
  return (
    <BentoCard>
      <PanelTitle
        icon={<Bell className="h-4 w-4" />}
        title={t("admin.messages")}
        action={
          <Button
            size="xs"
            variant="outline"
            onClick={() =>
              updateDraft((draft) => ({
                ...draft,
                topbar: {
                  ...draft.topbar,
                  messages: [
                    ...draft.topbar.messages,
                    {
                      id: `message-${Date.now()}`,
                      title: t("admin.newMessage"),
                      body: "",
                      actionLabel: null,
                      actionUrl: null,
                      qrText: null,
                      enabled: true,
                      sortOrder: nextSortOrder(draft.topbar.messages),
                    },
                  ],
                },
              }))
            }
          >
            <Plus />
            {t("admin.add")}
          </Button>
        }
      />
      <div className="mt-3 space-y-2">
        {content.topbar.messages.map((item) => (
          <div key={item.id} className="grid gap-1.5 rounded-[8px] border bg-muted/20 p-2 md:grid-cols-[auto_1fr_1fr_1fr_auto]">
            <Switch checked={item.enabled} onCheckedChange={(enabled) => patchMessage(updateDraft, item.id, { enabled })} />
            <Input value={item.title} onChange={(event) => patchMessage(updateDraft, item.id, { title: event.target.value })} className="h-7 text-xs" />
            <Input value={item.body} onChange={(event) => patchMessage(updateDraft, item.id, { body: event.target.value })} className="h-7 text-xs" />
            <Input value={item.actionUrl ?? ""} onChange={(event) => patchMessage(updateDraft, item.id, { actionUrl: event.target.value || null })} placeholder={t("admin.actionUrl")} className="h-7 text-xs" />
            <Button size="icon-sm" variant="ghost" onClick={() => removeMessage(updateDraft, item.id)}>
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>
    </BentoCard>
  );
}

function FeedbackAdmin({
  content,
  updateDraft,
}: {
  content: AdminContentFile;
  updateDraft: (updater: (content: AdminContentFile) => AdminContentFile) => void;
}) {
  const { t } = useTranslation();
  const items = content.feedbackItems;
  return (
    <BentoCard className="p-0">
      <SectionHeader icon={<MessageCircle className="h-4 w-4" />} title={t("admin.feedbackRecords")} />
      {items.length === 0 ? (
        <div className="flex min-h-[160px] items-center justify-center text-sm text-muted-foreground">
          {t("admin.noFeedback")}
        </div>
      ) : (
        <ScrollArea className="max-h-[calc(100vh-260px)]">
          <div className="divide-y divide-border">
            {items.map((item) => (
              <div key={item.id} className="grid gap-2 px-3.5 py-3 md:grid-cols-[150px_minmax(0,1fr)_90px_auto]">
                <span className="text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</span>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{item.text}</p>
                <Badge variant={item.status === "new" ? "secondary" : "outline"}>
                  {item.status === "new" ? t("admin.feedbackStatusNew") : t("admin.feedbackStatusHandled")}
                </Badge>
                <div className="flex items-start justify-end gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      patchFeedback(updateDraft, item.id, {
                        status: item.status === "new" ? "handled" : "new",
                      })
                    }
                  >
                    {item.status === "new" ? t("admin.markHandled") : t("admin.markNew")}
                  </Button>
                  <Button size="icon-sm" variant="ghost" onClick={() => removeFeedback(updateDraft, item.id)}>
                    <Trash2 />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </BentoCard>
  );
}

function SectionHeader({
  icon,
  title,
  action,
}: {
  icon: ReactNode;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b px-3.5 py-2.5">
      <PanelTitle icon={icon} title={title} />
      {action}
    </div>
  );
}

function PanelTitle({
  icon,
  title,
  action,
}: {
  icon: ReactNode;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
        {icon}
        <span className="truncate">{title}</span>
      </div>
      {action}
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

function cloneContent(content: AdminContentFile): AdminContentFile {
  return JSON.parse(JSON.stringify(content)) as AdminContentFile;
}

function nextSortOrder(items: Array<{ sortOrder: number }>) {
  return items.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 10;
}

function patchMysteryCode(
  updateDraft: (updater: (content: AdminContentFile) => AdminContentFile) => void,
  id: string,
  patch: Partial<AdminMysteryCode>,
) {
  updateDraft((draft) => ({
    ...draft,
    topbar: {
      ...draft.topbar,
      mystery: {
        ...draft.topbar.mystery,
        codes: draft.topbar.mystery.codes.map((item) =>
          item.id === id ? { ...item, ...patch } : item,
        ),
      },
    },
  }));
}

function removeMysteryCode(
  updateDraft: (updater: (content: AdminContentFile) => AdminContentFile) => void,
  id: string,
) {
  updateDraft((draft) => ({
    ...draft,
    topbar: {
      ...draft.topbar,
      mystery: {
        ...draft.topbar.mystery,
        codes: draft.topbar.mystery.codes.filter((item) => item.id !== id),
      },
    },
  }));
}

function patchNotification(
  updateDraft: (updater: (content: AdminContentFile) => AdminContentFile) => void,
  id: string,
  patch: Partial<AdminNotification>,
) {
  updateDraft((draft) => ({
    ...draft,
    topbar: {
      ...draft.topbar,
      notifications: draft.topbar.notifications.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    },
  }));
}

function removeNotification(
  updateDraft: (updater: (content: AdminContentFile) => AdminContentFile) => void,
  id: string,
) {
  updateDraft((draft) => ({
    ...draft,
    topbar: {
      ...draft.topbar,
      notifications: draft.topbar.notifications.filter((item) => item.id !== id),
    },
  }));
}

function patchMessage(
  updateDraft: (updater: (content: AdminContentFile) => AdminContentFile) => void,
  id: string,
  patch: Partial<AdminMessage>,
) {
  updateDraft((draft) => ({
    ...draft,
    topbar: {
      ...draft.topbar,
      messages: draft.topbar.messages.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    },
  }));
}

function removeMessage(
  updateDraft: (updater: (content: AdminContentFile) => AdminContentFile) => void,
  id: string,
) {
  updateDraft((draft) => ({
    ...draft,
    topbar: {
      ...draft.topbar,
      messages: draft.topbar.messages.filter((item) => item.id !== id),
    },
  }));
}

function patchFeedback(
  updateDraft: (updater: (content: AdminContentFile) => AdminContentFile) => void,
  id: string,
  patch: { status: string },
) {
  updateDraft((draft) => ({
    ...draft,
    feedbackItems: draft.feedbackItems.map((item) =>
      item.id === id ? { ...item, ...patch } : item,
    ),
  }));
}

function removeFeedback(
  updateDraft: (updater: (content: AdminContentFile) => AdminContentFile) => void,
  id: string,
) {
  updateDraft((draft) => ({
    ...draft,
    feedbackItems: draft.feedbackItems.filter((item) => item.id !== id),
  }));
}
