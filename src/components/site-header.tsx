import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Gift, MessageCircle, MessagesSquare } from "lucide-react";
import { useTranslation } from "react-i18next";

import { api } from "@/lib/api";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface SiteHeaderProps {
  title: string;
}

export function SiteHeader({ title }: SiteHeaderProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [mysteryOpen, setMysteryOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [mysteryCode, setMysteryCode] = useState("");

  const adminContentQuery = useQuery({
    queryKey: ["admin-content"],
    queryFn: () => api.loadAdminContent(),
  });
  const notificationStatusQuery = useQuery({
    queryKey: ["notification-status"],
    queryFn: () => api.loadNotificationStatus(),
  });
  const topbar = adminContentQuery.data?.data.content.topbar;
  const fallbackNotifications =
    topbar?.notifications
      .filter((item) => item.enabled)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => ({ ...item, read: false, dismissed: false })) ?? [];
  const notifications = notificationStatusQuery.data?.data.items ?? fallbackNotifications;
  const unreadCount =
    notificationStatusQuery.data?.data.unreadCount ??
    notifications.filter((item) => !item.read).length;
  const messages =
    topbar?.messages
      .filter((item) => item.enabled)
      .sort((a, b) => a.sortOrder - b.sortOrder) ?? [];

  const feedbackMutation = useMutation({
    mutationFn: (text: string) => api.submitTopbarFeedback(text),
    onSuccess: () => {
      setFeedbackOpen(false);
      setFeedbackText("");
      queryClient.invalidateQueries({ queryKey: ["admin-content"] });
      toast({
        title: t("topbar.feedbackSubmitted"),
        description: t("topbar.feedbackSubmittedDesc"),
        variant: "success",
      });
    },
    onError: (error) => {
      toast({
        title: t("common.error"),
        description: error instanceof Error ? error.message : t("common.toastErrorGenericDesc"),
        variant: "destructive",
      });
    },
  });
  const mysteryMutation = useMutation({
    mutationFn: (code: string) => api.verifyMysteryCode(code),
    onSuccess: (res) => {
      toast({
        title: res.data.title,
        description: res.data.message,
        variant: res.data.matched ? "success" : "default",
      });
      if (res.data.matched) {
        setMysteryOpen(false);
        setMysteryCode("");
      }
    },
    onError: (error) => {
      toast({
        title: t("common.error"),
        description: error instanceof Error ? error.message : t("common.toastErrorGenericDesc"),
        variant: "destructive",
      });
    },
  });
  const markAllNotificationsReadMutation = useMutation({
    mutationFn: () => api.markAllNotificationsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-status"] });
    },
  });

  const submitFeedback = () => {
    const text = feedbackText.trim();
    if (!text) {
      toast({
        title: t("common.error"),
        description: t("topbar.feedbackEmpty"),
        variant: "destructive",
      });
      return;
    }
    feedbackMutation.mutate(text);
  };

  const verifyMysteryCode = () => {
    const code = mysteryCode.trim();
    if (!code) {
      toast({
        title: t("common.error"),
        description: t("topbar.mysteryEmpty"),
        variant: "destructive",
      });
      return;
    }
    mysteryMutation.mutate(code);
  };

  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger
          className="-ml-1 h-8 w-auto gap-1.5 rounded-[8px] px-2 text-xs text-muted-foreground"
          label={t("nav.sidebarToggle")}
        />
        <Separator orientation="vertical" className="mr-2 !h-4" />
        <h1 className="min-w-0 truncate text-sm font-medium">{title}</h1>

        <div className="ml-auto flex items-center gap-1.5">
          <HeaderIconButton
            label={t("topbar.feedback")}
            onClick={() => setFeedbackOpen(true)}
          >
            <MessageCircle />
          </HeaderIconButton>
          <HeaderIconButton
            label={t("topbar.mysteryCode")}
            onClick={() => setMysteryOpen(true)}
          >
            <Gift />
          </HeaderIconButton>
          <Popover
            onOpenChange={(open) => {
              if (open && unreadCount > 0 && !markAllNotificationsReadMutation.isPending) {
                markAllNotificationsReadMutation.mutate();
              }
            }}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("topbar.notifications")}
                    className="relative text-muted-foreground hover:text-foreground"
                  >
                    <Bell />
                    {unreadCount > 0 && (
                      <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>{t("topbar.notifications")}</TooltipContent>
            </Tooltip>
            <PopoverContent align="end" className="w-64 p-0">
              <div className="border-b px-4 py-3 text-sm font-semibold">
                {t("topbar.notifications")}
              </div>
              <div className="flex min-h-[88px] items-center justify-center px-4 py-6 text-sm text-muted-foreground">
                {notifications.length === 0 ? (
                  t("topbar.noNotifications")
                ) : (
                  <div className="w-full space-y-2 text-left">
                    {notifications.map((item) => (
                      <div
                        key={item.id}
                        className={cn(
                          "rounded-[8px] border px-3 py-2",
                          item.read ? "bg-muted/20" : "border-primary/30 bg-primary/5",
                        )}
                      >
                        <div
                          className={cn(
                            "truncate text-xs text-foreground",
                            item.read ? "font-medium" : "font-semibold",
                          )}
                        >
                          {item.title}
                        </div>
                        <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {item.body}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("topbar.messages")}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <MessagesSquare />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>{t("topbar.messages")}</TooltipContent>
            </Tooltip>
            <PopoverContent align="end" className="w-72 p-0">
              <div className="border-b px-4 py-3 text-sm font-semibold">
                {messages[0]?.title ?? t("topbar.messageTitle")}
              </div>
              <div className="flex flex-col gap-3 px-5 py-5">
                {messages.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    {t("topbar.noMessages")}
                  </div>
                ) : (
                  messages.map((item) => (
                    <div key={item.id} className="flex flex-col items-center gap-2 text-center">
                      {item.qrText && <QrPreview />}
                      <div className="text-sm font-medium">{item.body}</div>
                      {item.actionUrl && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            void import("@tauri-apps/plugin-shell").then(({ open }) =>
                              open(item.actionUrl!),
                            );
                          }}
                        >
                          {item.actionLabel ?? t("topbar.openMessage")}
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </header>

      <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{topbar?.feedback.title ?? t("topbar.feedbackTitle")}</DialogTitle>
            <DialogDescription>{topbar?.feedback.description ?? t("topbar.feedbackDesc")}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={feedbackText}
            onChange={(event) => setFeedbackText(event.target.value)}
            placeholder={topbar?.feedback.placeholder ?? t("topbar.feedbackPlaceholder")}
            className="min-h-[132px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeedbackOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={submitFeedback} disabled={feedbackMutation.isPending || !feedbackText.trim()}>
              {topbar?.feedback.submitLabel ?? t("topbar.submitFeedback")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mysteryOpen} onOpenChange={setMysteryOpen}>
        <DialogContent className="max-w-md overflow-hidden">
          <MysteryDots />
          <DialogHeader className="relative z-10">
            <DialogTitle>{topbar?.mystery.title ?? t("topbar.mysteryTitle")}</DialogTitle>
            <DialogDescription>{topbar?.mystery.description ?? t("topbar.mysteryDesc")}</DialogDescription>
          </DialogHeader>
          <Input
            value={mysteryCode}
            onChange={(event) => setMysteryCode(event.target.value)}
            placeholder={topbar?.mystery.placeholder ?? t("topbar.mysteryPlaceholder")}
            className="relative z-10"
          />
          <DialogFooter className="relative z-10">
            <Button variant="outline" onClick={() => setMysteryOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={verifyMysteryCode} disabled={mysteryMutation.isPending || !mysteryCode.trim()}>
              {topbar?.mystery.verifyLabel ?? t("topbar.verify")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function HeaderIconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          onClick={onClick}
          className="text-muted-foreground hover:text-foreground"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function QrPreview() {
  return (
    <div className="grid h-32 w-32 grid-cols-9 grid-rows-9 gap-1 rounded-[8px] border bg-white p-2 shadow-sm">
      {QR_CELLS.map((active, index) => (
        <span
          key={index}
          className={cn(
            "rounded-[2px]",
            active ? "bg-neutral-950" : "bg-transparent",
          )}
        />
      ))}
    </div>
  );
}

function MysteryDots() {
  return (
    <div className="pointer-events-none absolute inset-0 opacity-60">
      {MYSTERY_DOTS.map((dot) => (
        <span
          key={`${dot.left}-${dot.top}`}
          className={cn("absolute h-2 w-2 rounded-full", dot.className)}
          style={{ left: dot.left, top: dot.top }}
        />
      ))}
    </div>
  );
}

const QR_CELLS = [
  1, 1, 1, 0, 1, 0, 1, 1, 1,
  1, 0, 1, 0, 1, 1, 1, 0, 1,
  1, 1, 1, 0, 0, 1, 1, 1, 1,
  0, 0, 0, 1, 1, 0, 0, 1, 0,
  1, 1, 0, 1, 0, 1, 0, 1, 1,
  0, 1, 1, 0, 1, 1, 0, 0, 1,
  1, 1, 1, 0, 1, 0, 1, 1, 1,
  1, 0, 1, 1, 0, 1, 1, 0, 1,
  1, 1, 1, 0, 1, 1, 1, 1, 1,
].map(Boolean);

const MYSTERY_DOTS = [
  { left: "8%", top: "18%", className: "bg-rose-400" },
  { left: "18%", top: "74%", className: "bg-amber-400" },
  { left: "32%", top: "12%", className: "bg-sky-400" },
  { left: "55%", top: "84%", className: "bg-emerald-400" },
  { left: "78%", top: "18%", className: "bg-violet-400" },
  { left: "88%", top: "62%", className: "bg-pink-400" },
];
