/**
 * Text/SMS Notification Handler
 * Handles incoming SMS/MMS push notifications
 */

import { store } from "store/global-store.ts";
import * as textActions from "store/text/actions.ts";
import { TextMessageReceivedEvent } from "shared/api/messaging/types.ts";
import { Logger } from "shared/utils/Logger.ts";
import { getSmsFcmSenderPhone } from "./resolveSmsSenderDisplayName.ts";

const logger = new Logger("TextNotificationHandler");

// Deduplication cache: Store recently processed message IDs
const processedMessages = new Map<string, number>();
const MESSAGE_CACHE_DURATION = 10000; // 10 seconds

/**
 * Clean up old entries from the processed messages cache
 */
const cleanupProcessedMessages = () => {
  const now = Date.now();
  const expiredKeys: string[] = [];

  processedMessages.forEach((timestamp, messageId) => {
    if (now - timestamp > MESSAGE_CACHE_DURATION) {
      expiredKeys.push(messageId);
    }
  });

  expiredKeys.forEach((key) => processedMessages.delete(key));
};

/**
 * Handle incoming SMS push notification
 * Called when app receives a push notification for a new SMS/MMS message
 */
export const handleTextNotification = (notification: any): void => {
  // Clean up old cache entries
  cleanupProcessedMessages();

  // Extract FCM messageId for deduplication
  const fcmMessageId = notification.messageId || notification.data?.messageId;

  if (fcmMessageId && processedMessages.has(fcmMessageId)) {
    console.log(
      "🚫 [TextNotificationHandler] Duplicate SMS notification blocked:",
      {
        messageId: fcmMessageId,
        cacheSize: processedMessages.size
      }
    );
    return;
  }

  // Mark this message as processed
  if (fcmMessageId) {
    processedMessages.set(fcmMessageId, Date.now());
    console.log(
      "✅ [TextNotificationHandler] SMS message marked as processed:",
      {
        messageId: fcmMessageId,
        cacheSize: processedMessages.size
      }
    );
  }

  console.log("📱 [TextNotificationHandler] Received notification:", {
    hasData: !!(notification.data || notification),
    notificationKeys: Object.keys(notification),
    hasNotification: !!notification.notification,
    data: notification.data || notification,
    fullNotification: notification
  });

  try {
    // Extract SMS data from notification payload
    // Handle both direct data and nested data structure
    const data = notification.data || notification;

    // Extract text from notification body if not in data
    const messageText =
      data.text || data.message || notification.notification?.body || "";

    // Handle reference_id (used in thread notifications) as conversationId
    const conversationId =
      data.conversationId || data.conversation_id || data.reference_id || null;

    let parsedMediaUrls: string[] = [];
    const rawMediaUrls = data.mediaUrls || data.media_urls;
    if (rawMediaUrls) {
      if (typeof rawMediaUrls === "string") {
        try {
          parsedMediaUrls = JSON.parse(rawMediaUrls);
        } catch (_e) {
          if (rawMediaUrls.trim()) {
            parsedMediaUrls = [rawMediaUrls];
          }
        }
      } else if (Array.isArray(rawMediaUrls)) {
        parsedMediaUrls = rawMediaUrls;
      }
    }

    console.log("📱 [TextNotificationHandler] Extracted data:", {
      conversationId: conversationId,
      reference_id: data.reference_id,
      messageId: data.messageId,
      from: getSmsFcmSenderPhone(data),
      peerName: data.peerName,
      hasText: !!messageText,
      textLength: messageText?.length || 0,
      hasMedia: parsedMediaUrls.length > 0,
      mediaCount: parsedMediaUrls.length,
      rawMediaUrls: rawMediaUrls,
      hasCreatedConversations: !!(
        data.createdConversations && data.createdConversations.length > 0
      ),
      timestamp: data.timestamp
    });

    // Validate conversationId is present
    if (!conversationId) {
      console.warn(
        "📱 [TextNotificationHandler] No conversationId/reference_id found in notification data"
      );
      return;
    }

    const event: TextMessageReceivedEvent = {
      conversationId: parseInt(conversationId.toString(), 10),
      createdConversations: data.createdConversations || [],
      from: getSmsFcmSenderPhone(data) || "",
      id: parseInt(data.messageId || "0", 10) || Date.now(),
      mediaUrls: parsedMediaUrls,
      peerName: data.peerName || "",
      text: messageText,
      timestamp:
        parseInt(data.timestamp || Date.now().toString(), 10) || Date.now()
    };

    console.log(
      "📱 [TextNotificationHandler] Created event object, dispatching to saga:",
      {
        conversationId: event.conversationId,
        messageId: event.id,
        from: event.from,
        hasText: !!event.text,
        fullEvent: event
      }
    );
    // Dispatch action to handle SMS push notification
    store.dispatch(textActions.handleSMSPushNotification(event));

    console.log(
      "✅ [TextNotificationHandler] Successfully dispatched SMS push notification action"
    );
  } catch (error) {
    console.error("❌ [TextNotificationHandler] Error:", error);
  }
};

/**
 * Handle SMS error notification
 * Called when a message fails to send
 */
export const handleTextErrorNotification = (notification: any): void => {
  try {
    logger.debug("Handling text error notification", notification);

    const data = notification.data || notification;

    const errorEvent = {
      conversationId: parseInt(data.conversationId),
      messageId: parseInt(data.messageId),
      errorMsg: data.errorMsg || "Failed to send message"
    };

    // Dispatch action to handle error
    store.dispatch(textActions.handleErrorMessage(errorEvent));

    logger.debug("Text error notification handled successfully");
  } catch (error) {
    logger.error("Error handling text error notification", error);
  }
};

/**
 * Register text notification handlers
 * Should be called when app initializes
 */
export const registerTextNotificationHandlers = () => {
  logger.debug("Registering text notification handlers");

  // TODO: Register with native notification manager
  // This will depend on your notification setup (FCM for Android, APNs for iOS)
  // Example:
  // NotificationManager.on('text_message_received', handleTextNotification);
  // NotificationManager.on('text_message_error', handleTextErrorNotification);
};

/**
 * Unregister text notification handlers
 * Should be called when user logs out
 */
export const unregisterTextNotificationHandlers = () => {
  logger.debug("Unregistering text notification handlers");

  // TODO: Unregister from native notification manager
};
