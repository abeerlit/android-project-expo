import { useCallback, useState } from "react";
import type { NotificationToken } from "core/notifications/NotificationManager.ts";

export interface UseNotificationsResult {
  tokens: NotificationToken[];
  isInitialized: boolean;
  setViewingConversation: (conversationId: string | null) => void;
}

export const useNotifications = (): UseNotificationsResult => {
  const [tokens] = useState<NotificationToken[]>([]);
  const setViewingConversation = useCallback((_id: string | null) => {}, []);
  return {
    tokens,
    isInitialized: false,
    setViewingConversation
  };
};
