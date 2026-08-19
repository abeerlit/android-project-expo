/**
 * Shared fast Notifee post for Android Sendbird chat (websocket background + FCM).
 */
import { AppState, Platform } from "react-native";
import { GroupChannel } from "@sendbird/chat/groupChannel";
import { BaseMessage, MessageType } from "@sendbird/chat/message";
import notifee, { AndroidImportance } from "@notifee/react-native";
import { shouldBlockSendbirdFcmFromPrefsCache } from "core/notifications/androidChatNotificationPrefsCache.ts";
import type { User } from "shared/api/users/types.ts";
import { isHtml } from "shared/utils/utils.ts";
import { CustomChannelType } from "features/chat/types.ts";
import {
  getSendbirdNotificationInFlightSource,
  markSendbirdNotificationDisplayed,
  releaseSendbirdNotificationDisplayClaim,
  shouldSkipSendbirdNotificationDisplay,
  tryClaimSendbirdNotificationDisplay,
  wasSendbirdNotificationDisplayed
} from "./sendbirdNotificationDedupe.ts";
export const ANDROID_CHAT_NOTIF_CHANNEL_ID = "voxo-notifications";

export type SendbirdFcmPayload = {
  message_id?: string | number;
  message?: string;
  type?: string;
  message_type?: string;
  messageType?: string;
  custom_type?: string;
  files?: unknown[];
  sender?: {
    name?: string;
    nickname?: string;
    userId?: string;
    id?: string;
  };
  channel?: {
    channel_url?: string;
    name?: string;
    custom_type?: string;
    customType?: string;
  };
};

export type SendbirdNotificationContent = {
  title: string;
  body: string;
  channelUrl: string;
  parentMessageId?: number;
};

export type PostSendbirdChatNotificationParams = {
  messageId: number | string;
  title: string;
  body: string;
  channelUrl: string;
  parentMessageId?: number;
  source: "sdk" | "fcm";
  data?: Record<string, string>;
};

function stripHtmlMessage(text: string): string {
  let messageContent = text;
  if (!messageContent) return "";
  if (isHtml(messageContent)) {
    messageContent = messageContent.replace(/<[^>]+>/g, "");
    messageContent = messageContent.replace(/&nbsp;/g, " ");
    messageContent = messageContent.replace(/&amp;/g, "&");
    messageContent = messageContent.replace(/&lt;/g, "<");
    messageContent = messageContent.replace(/&gt;/g, ">");
    messageContent = messageContent.replace(/&quot;/g, '"');
    messageContent = messageContent.replace(/&#39;/g, "'");
    messageContent = messageContent.replace(/&apos;/g, "'");
    messageContent = messageContent.replace(/\s+/g, " ").trim();
  }
  return messageContent;
}

export function shouldBlockSendbirdNotificationFromFcmPayload(
  sendbirdData: SendbirdFcmPayload
): boolean {
  return shouldBlockSendbirdFcmFromPrefsCache(sendbirdData);
}

export function shouldBlockSendbirdChatNotification(
  channel: GroupChannel,
  message: BaseMessage,
  user: User | null | undefined
): boolean {
  if (!user) {
    return false;
  }

  if (user.enableChatNotifications !== 1) {
    return true;
  }

  const directMessagesOnlyEnabled = user.enableDirectMessageNotifications === 1;
  const allNewMessagesEnabled = user.enableAllNewMessageNotifications === 1;

  if (directMessagesOnlyEnabled && user.tenantId) {
    const isGroupChannel =
      channel.customType === CustomChannelType.groupChannel(user.tenantId);
    if (isGroupChannel) {
      return true;
    }
  } else if (!allNewMessagesEnabled && user.tenantId) {
    const isDM =
      channel.customType === CustomChannelType.dmChannel(user.tenantId) ||
      channel.customType === CustomChannelType.personalChannel(user.tenantId);
    if (!isDM) {
      return true;
    }
  }

  const channelPushOption = channel.myPushTriggerOption;
  const activeUserId = String(user.id || "");
  const msgForMentionCheck = message as {
    mentionedUserIds?: string[];
    mentionedUsers?: { userId?: string }[];
  };
  const mentionedIds = msgForMentionCheck.mentionedUserIds || [];
  const mentionedList = msgForMentionCheck.mentionedUsers || [];
  const isUserMentioned =
    mentionedIds.some((id: string) => String(id) === activeUserId) ||
    mentionedList.some((u) => String(u.userId) === activeUserId);

  if (channelPushOption === "off") {
    return true;
  }

  if (channelPushOption === "mention_only" && !isUserMentioned) {
    return true;
  }

  if (message.messageType === MessageType.ADMIN) {
    const messageText = ((message as { message?: string }).message || "").toLowerCase();
    const isChannelCreationMessage =
      !messageText ||
      messageText.trim().length === 0 ||
      messageText.includes("joined") ||
      messageText.includes("channel created") ||
      messageText.includes("created channel") ||
      messageText.includes("is created") ||
      messageText.includes("the channel is created");
    if (isChannelCreationMessage) {
      return true;
    }
  }

  return false;
}

export function buildSendbirdNotificationContent(
  channel: GroupChannel,
  message: BaseMessage,
  user: User | null | undefined
): SendbirdNotificationContent | null {
  const messageWithSender = message as {
    sender?: { nickname?: string; name?: string; userId?: string };
    customType?: string;
    parentMessageId?: number;
    message?: string;
    metaArrays?: { key?: string }[];
    mentionedUserIds?: string[];
    mentionedUsers?: { userId?: string }[];
  };

  const sender = messageWithSender.sender;
  const senderName =
    sender?.nickname || sender?.name || sender?.userId || "";

  let messageContent = "";
  const customType = messageWithSender.customType;
  const isThreadReply = !!message.parentMessageId;

  const currentUserId = String(user?.id || "");
  const mentionedUserIds = messageWithSender.mentionedUserIds || [];
  const mentionedUsers = messageWithSender.mentionedUsers || [];
  const isMentioned =
    mentionedUserIds.some((id: string) => String(id) === currentUserId) ||
    mentionedUsers.some((u) => String(u.userId) === currentUserId);

  if (customType === "MESSAGE_GIF") {
    messageContent = "Received a GIF 🎞️";
  } else if (customType === "MEETING_INVITE") {
    messageContent = "Invited you to a meeting";
  } else if (message.messageType === MessageType.USER) {
    messageContent = stripHtmlMessage(messageWithSender.message || "");

    if (!messageContent.trim()) {
      const metaArrays = messageWithSender.metaArrays || [];
      const hasGifMeta = metaArrays.some(
        (meta) =>
          meta.key === "url" || meta.key === "gif_url" || meta.key === "title"
      );
      messageContent = hasGifMeta
        ? "Received an attachment 📎"
        : "Sent a message";
    }
  } else if (message.messageType === MessageType.FILE) {
    messageContent = "Received an attachment 📎";
  } else {
    messageContent = "New message";
  }

  if (isMentioned && customType !== "MEETING_INVITE") {
    messageContent = "You were mentioned";
  }

  if (isThreadReply) {
    messageContent = `Reply: ${messageContent}`;
  }

  const isDM =
    !!user?.tenantId &&
    (channel.customType === CustomChannelType.dmChannel(user.tenantId) ||
      channel.customType === CustomChannelType.personalChannel(user.tenantId));

  const title = isDM
    ? senderName || channel.name || "New Message"
    : channel.name || "New Message";

  const body =
    !isDM && senderName
      ? `${senderName}: ${messageContent}`
      : messageContent;

  if (!title && !body.trim()) {
    return null;
  }

  return {
    title,
    body: body.trim() || "New message",
    channelUrl: channel.url,
    parentMessageId: isThreadReply ? message.parentMessageId : undefined
  };
}

export async function postSendbirdChatNotificationFast(
  params: PostSendbirdChatNotificationParams
): Promise<boolean> {
  if (Platform.OS !== "android") {
    return false;
  }

  const { messageId, title, body, channelUrl, parentMessageId, source, data } =
    params;

  if (!title && !body) {
    console.log(`🚫 [${source} Fast] empty title/body`, { messageId });
    return false;
  }

  const notificationId = `sendbird-${messageId}`;

  if (shouldSkipSendbirdNotificationDisplay(messageId, source)) {
    const holder = getSendbirdNotificationInFlightSource(messageId);
    console.log(`🚫 [${source} Fast] skip — already shown or in-flight`, {
      notificationId,
      alreadyDisplayed: wasSendbirdNotificationDisplayed(messageId),
      inFlightHolder: holder
    });
    return true;
  }

  if (!tryClaimSendbirdNotificationDisplay(messageId, source)) {
    const holder = getSendbirdNotificationInFlightSource(messageId);
    console.log(`🚫 [${source} Fast] skip — claim failed`, {
      notificationId,
      inFlightHolder: holder
    });
    return true;
  }

  try {
    const notificationData: Record<string, string> = {
      ...(data ?? {}),
      click_action: "SENDBIRD-RECEIVED",
      messageId: String(messageId),
      channelUrl
    };
    if (parentMessageId) {
      notificationData.parentMessageId = String(parentMessageId);
      notificationData.parent_message_id = String(parentMessageId);
    }

    if (wasSendbirdNotificationDisplayed(messageId)) {
      releaseSendbirdNotificationDisplayClaim(messageId);
      console.log(
        `🚫 [${source} Fast] skip — other path posted before Notifee (final gate)`,
        { notificationId }
      );
      return true;
    }

    console.log(`🔔 [${source} Fast] posting_notifee`, {
      notificationId,
      title,
      appState: AppState.currentState
    });

    await notifee.displayNotification({
      id: notificationId,
      title,
      body,
      data: notificationData,
      android: {
        channelId: ANDROID_CHAT_NOTIF_CHANNEL_ID,
        smallIcon: "ic_notification",
        importance: AndroidImportance.HIGH,
        pressAction: { id: "default" },
        sound: "default",
        vibrationPattern: [300, 500],
        showWhen: true,
        timestamp: Date.now(),
        autoCancel: true
      }
    });

    markSendbirdNotificationDisplayed(messageId);

    console.log(`✅ [${source} Fast] notification displayed`, {
      notificationId,
      bodyPreview: body.substring(0, 80)
    });
    return true;
  } catch (e) {
    console.error(`❌ [${source} Fast] display failed:`, e);
    releaseSendbirdNotificationDisplayClaim(messageId);
    return false;
  }
}

/** Android background/inactive: websocket delivery uses same fast post as FCM. */
export async function displaySendbirdNotificationFromSdkFast(
  channel: GroupChannel,
  message: BaseMessage,
  user: User | null | undefined
): Promise<void> {
  if (Platform.OS !== "android") {
    return;
  }

  const appState = AppState.currentState;
  if (appState === "active") {
    return;
  }

  if (shouldBlockSendbirdChatNotification(channel, message, user)) {
    console.log("🚫 [sdk Fast] blocked by notification rules", {
      messageId: message.messageId,
      channelUrl: channel.url,
      appState
    });
    return;
  }

  const content = buildSendbirdNotificationContent(channel, message, user);
  if (!content) {
    console.log("🚫 [sdk Fast] empty content", { messageId: message.messageId });
    return;
  }

  await postSendbirdChatNotificationFast({
    messageId: message.messageId,
    title: content.title,
    body: content.body,
    channelUrl: content.channelUrl,
    parentMessageId: content.parentMessageId,
    source: "sdk"
  });
}
