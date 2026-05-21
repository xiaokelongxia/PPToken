import { useState } from "react";
import { Bell, Gift, MessageCircle, MessagesSquare } from "lucide-react";
import { useTranslation } from "react-i18next";

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
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [mysteryOpen, setMysteryOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [mysteryCode, setMysteryCode] = useState("");

  const submitFeedback = () => {
    setFeedbackOpen(false);
    setFeedbackText("");
    toast({
      title: t("topbar.feedbackSubmitted"),
      description: t("topbar.feedbackSubmittedDesc"),
      variant: "success",
    });
  };

  const verifyMysteryCode = () => {
    toast({
      title: t("topbar.mysteryInvalid"),
      description: t("topbar.mysteryInvalidDesc"),
    });
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
          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("topbar.notifications")}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Bell />
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
                {t("topbar.noNotifications")}
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
                {t("topbar.messageTitle")}
              </div>
              <div className="flex flex-col items-center gap-3 px-5 py-5">
                <QrPreview />
                <div className="text-sm font-medium">{t("topbar.groupCodeDrop")}</div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </header>

      <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("topbar.feedbackTitle")}</DialogTitle>
            <DialogDescription>{t("topbar.feedbackDesc")}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={feedbackText}
            onChange={(event) => setFeedbackText(event.target.value)}
            placeholder={t("topbar.feedbackPlaceholder")}
            className="min-h-[132px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeedbackOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={submitFeedback}>{t("topbar.submitFeedback")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mysteryOpen} onOpenChange={setMysteryOpen}>
        <DialogContent className="max-w-md overflow-hidden">
          <MysteryDots />
          <DialogHeader className="relative z-10">
            <DialogTitle>{t("topbar.mysteryTitle")}</DialogTitle>
            <DialogDescription>{t("topbar.mysteryDesc")}</DialogDescription>
          </DialogHeader>
          <Input
            value={mysteryCode}
            onChange={(event) => setMysteryCode(event.target.value)}
            placeholder={t("topbar.mysteryPlaceholder")}
            className="relative z-10"
          />
          <DialogFooter className="relative z-10">
            <Button variant="outline" onClick={() => setMysteryOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={verifyMysteryCode}>{t("topbar.verify")}</Button>
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
  children: React.ReactNode;
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
