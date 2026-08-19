/**
 * use-notifications.ts
 * React hook for using the notification system
 *
 * This hook provides a simple interface to:
 * - Initialize the notification system
 * - Get notification tokens for push registration
 * - Set the currently viewing conversation (to suppress duplicate notifications)
 *
 * Note: Notification handling (display, navigation) is handled internally by NotificationManager
 */
import { useEffect, useState, useCallback } from "react";
import { useDispatch } from "react-redux";
import { Platform } from "react-native";
import notifee, { AndroidImportance } from "@notifee/react-native";
import NotificationManager, {
  NotificationToken
} from "core/notifications/NotificationManager.ts";
import { resolveSmsSenderDisplayName } from "core/notifications/resolveSmsSenderDisplayName.ts";
import { useSendbirdContext } from "features/chat/utils/SendbirdContext.ts";
import * as textActions from "store/text/actions.ts";
import * as userActions from "store/users/actions.ts";

export interface UseNotificationsResult {
  tokens: NotificationToken[];
  isInitialized: boolean;
  setViewingConversation: (conversationId: string | null) => void;
}

export const useNotifications = (): UseNotificationsResult => {
  const [tokens, setTokens] = useState<NotificationToken[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const { refreshChannel, sendbirdInstance, isConnected } =
    useSendbirdContext();
  const dispatch = useDispatch();

  const handleTokenReceived = useCallback(
    (token: NotificationToken) => {
      setTokens((prev) => {
        const filtered = prev.filter((t) => t.tokenType !== token.tokenType);
        return [...filtered, token];
      });
      // Register VoIP token with backend so it can send VoIP push when app is background/killed.
      if (token.tokenType === "ios_voip" && token.token) {
        dispatch({
          type: userActions.STORE_PUSH_ID,
          payload: {
            pushToken: token.token,
            tokenType: "ios_voip"
          }
        });
      }
    },
    [dispatch]
  );

  const handleSendbirdMessageReceived = useCallback(
    (channelUrl: string, unreadCount?: number) => {
      console.log(
        "🔄 [useNotifications] Sendbird message received, refreshing channel:",
        channelUrl,
        "unread:",
        unreadCount
      );
      refreshChannel(channelUrl, unreadCount);
    },
    [refreshChannel]
  );

  const handleFetchSendbirdMessage = useCallback(
    async (channelUrl: string, messageId: string) => {
      if (!sendbirdInstance || !isConnected) {
        console.warn(
          "⚠️ [useNotifications] Sendbird not connected, cannot fetch message"
        );
        return null;
      }

      try {
        // Get channel first.
        const channel = await sendbirdInstance.groupChannel.getChannel(
          channelUrl
        );
        if (!channel) {
          console.error("❌ [useNotifications] Channel not found:", channelUrl);
          return null;
        }

        // Fetch message.
        const message = await sendbirdInstance.message.getMessage({
          messageId: parseInt(messageId, 10),
          channelUrl: channelUrl,
          channelType: channel.channelType,
          includeThreadInfo: true,
          includeMetaArray: true,
          includeReactions: true
        });

        //@ts-ignore
        console.log(
          "✅ [useNotifications] Parent message fetched:",
          message?.messageId
        );
        return message;
      } catch (error) {
        console.error(
          "❌ [useNotifications] Error fetching Sendbird message:",
          error
        );
        return null;
      }
    },
    [sendbirdInstance, isConnected]
  );

  useEffect(() => {
    let mounted = true;

    // Listen for iOS native conversation updates (badge sync)
    // When iOS receives TEXT-RECEIVED notification, native sends onConversationUpdated
    // This triggers fetchConversations to update unread counts and badge
    let removeConversationListener: (() => void) | undefined;
    let removeSmsNotificationListener: (() => void) | undefined;

    if (Platform.OS === "ios") {
      removeConversationListener =
        VoxoNotificationManager.addConversationUpdateListener((data) => {
          console.log(
            "📱 [useNotifications] iOS native conversation updated, fetching conversations for badge sync:",
            data.conversationId
          );
          dispatch(textActions.fetchConversations());
        });

      // Listen for SMS notifications with empty body (like GIFs) that need Notifee display
      removeSmsNotificationListener =
        VoxoNotificationManager.addSmsNotificationListener(async (data) => {
          console.log(
            "📱 [useNotifications] iOS SMS notification received for Notifee display:",
            data
          );

          try {
            // Determine notification body based on mediaUrls
            // Note: iOS push payload often doesn't include mediaUrls, so empty body = likely media
            let body = data.body || "";
            if (!body.trim()) {
              // Check if we have mediaUrls to determine type
              if (data.mediaUrls && data.mediaUrls.length > 0) {
                const firstUrl = (data.mediaUrls[0] || "").toLowerCase();
                const isGif =
                  firstUrl.endsWith(".gif") ||
                  firstUrl.includes("giphy") ||
                  firstUrl.includes("tenor.com") ||
                  firstUrl.includes("gph.is") ||
                  firstUrl.includes("/gif/") ||
                  firstUrl.includes("gif.");

                if (isGif) {
                  body = "Received a GIF 🎞️";
                  console.log(
                    "✅ [useNotifications] SMS GIF detected via mediaUrls!"
                  );
                } else {
                  body = "Received an attachment 📎";
                }
              } else {
                // No mediaUrls in payload - default to attachment (most likely case for empty body SMS)
                body = "Received an attachment 📎";
                console.log(
                  "📱 [useNotifications] SMS empty body without mediaUrls - defaulting to attachment"
                );
              }
            }

            const title = resolveSmsSenderDisplayName(
              data.from,
              data.peerName,
              {
                systemNotificationTitle: data.title,
                notificationBody: data.body,
                conversationId:
                  data.reference_id || data.conversationId || data.conversation_id
              }
            );

            // Create notification channel
            const channelId = await notifee.createChannel({
              id: "voxo-sms-notifications",
              name: "SMS Notifications",
              importance: AndroidImportance.HIGH,
              vibration: true,
              sound: "default"
            });

            // Display notification via Notifee
            await notifee.displayNotification({
              title,
              body,
              android: {
                channelId,
                importance: AndroidImportance.HIGH,
                pressAction: { id: "default" },
                smallIcon: "ic_notification",
                timestamp: Date.now(),
                showTimestamp: true,
                visibility: 1
              },
              ios: { sound: "default" },
              data: {
                click_action: "TEXT-RECEIVED",
                reference_id: data.conversationId,
                conversationId: data.conversationId,
                peerName: data.peerName,
                from: data.from
              }
            });

            console.log(
              "✅ [useNotifications] SMS notification displayed via Notifee:",
              { title, body }
            );

            // Also fetch conversations for badge sync
            dispatch(textActions.fetchConversations());
          } catch (error) {
            console.error(
              "❌ [useNotifications] Error displaying SMS notification:",
              error
            );
          }
        });
    }

    NotificationManager.initialize(
      {
        onTokenReceived: (token) => {
          if (mounted) handleTokenReceived(token);
        },
        onSendbirdMessageReceived: handleSendbirdMessageReceived,
        onFetchSendbirdMessage: handleFetchSendbirdMessage
      },
      { deferPermissionRequest: Platform.OS === "android" }
    ).then(() => {
      if (mounted) setIsInitialized(true);
    });

    return () => {
      mounted = false;
      removeConversationListener?.();
      removeSmsNotificationListener?.();
      // Don't destroy NotificationManager here - it should persist across re-renders
      // Destruction is handled by logout saga in authentication/sagas.ts
    };
  }, [
    handleTokenReceived,
    handleSendbirdMessageReceived,
    handleFetchSendbirdMessage,
    dispatch
  ]);

  const setViewingConversation = useCallback(
    (conversationId: string | null) => {
      NotificationManager.setViewingConversation(conversationId);
    },
    []
  );

  return {
    tokens,
    isInitialized,
    setViewingConversation
  };
};
