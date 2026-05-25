import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api";
import type { LocalNotificationItem } from "@/types";

export interface LocalNotification {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

function toLocalNotification(item: LocalNotificationItem): LocalNotification {
  return {
    id: item.id,
    title: item.title,
    body: item.body,
    read: item.read,
    createdAt: "",
  };
}

export function useNotifications(enabled = true) {
  const [notifications, setNotifications] = useState<LocalNotification[]>([]);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setNotifications([]);
      return;
    }
    try {
      const res = await api.loadNotificationStatus();
      setNotifications(res.data.items.map(toLocalNotification));
    } catch {
      setNotifications([]);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read).length,
    [notifications],
  );

  const markRead = useCallback(
    async (id: string) => {
      const res = await api.markNotificationRead(id);
      setNotifications(res.data.items.map(toLocalNotification));
    },
    [],
  );

  const markAllRead = useCallback(async () => {
    const res = await api.markAllNotificationsRead();
    setNotifications(res.data.items.map(toLocalNotification));
  }, []);

  return { notifications, unreadCount, markRead, markAllRead, refresh };
}
