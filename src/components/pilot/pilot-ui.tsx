import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function PilotPageHeader({
  description,
  source,
  refreshing,
  onRefresh,
}: {
  description: string;
  source?: string;
  refreshing?: boolean;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="max-w-3xl text-xs leading-snug text-muted-foreground">
          {description}
        </p>
        {source && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {t("pilot.source")}: {source}
          </p>
        )}
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onRefresh}
        disabled={refreshing}
        className="shrink-0"
      >
        <RefreshCw className={cn(refreshing && "animate-spin")} />
        {refreshing ? t("common.refreshing") : t("common.refresh")}
      </Button>
    </div>
  );
}

export function PilotTableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
