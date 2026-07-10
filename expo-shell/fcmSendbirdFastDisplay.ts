/**
 * Display Sendbird FCM notifications without Redux/store (background/killed fast path).
 */
import { AppState } from "react-native";
import {
  syncAndroidChatNotificationPrefsFromUser,
  getAndroidChatNotificationPrefs
} from "core/notifications/androidChatNotificationPrefsCache.ts";
import {
  shouldBlockSendbirdNotificationFromFcmPayload,
  postSendbirdChatNotificationFast,
  type SendbirdFcmPayload
} from "features/chat/utils/sendbirdChatNotificationFast.ts";
import {
  getSendbirdNotificationInFlightSource,
  shouldSkipSendbirdNotificationDisplay,
  wasSendbirdNotificationDisplayed
} from "features/chat/utils/sendbirdNotificationDedupe.ts";
import { logAndroidFcmProcessorStep } from "./androidFcmPayloadLogger.ts";

export { ANDROID_CHAT_NOTIF_CHANNEL_ID } from "features/chat/utils/sendbirdChatNotificationFast.ts";
export type { SendbirdFcmPayload };

const LOG_RELEASE = true;

function logRelease(...args: unknown[]) {
  if (LOG_RELEASE) {
    console.log(...args);
  }
}

type RemoteMessage = {
  messageId?: string;
  data?: Record<string, string>;
  notification?: { title?: string; body?: string };
};

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, "").trim();
}

export function parseSendbirdFromFcmData(
  data: Record<string, string>
): SendbirdFcmPayload | null {
  try {
    const raw = data.sendbird;
    if (!raw) return null;
    return (
      typeof raw === "string" ? JSON.parse(raw) : raw
    ) as SendbirdFcmPayload;
  } catch (e) {
    console.error("❌ [FCM Fast] parse sendbird failed:", e);
    return null;
  }
}

export function buildSendbirdTitleBodyFromFcm(sendbirdData: SendbirdFcmPayload): {
  title: string;
  body: string;
  channelUrl?: string;
} {
  const senderName =
    sendbirdData?.sender?.name || sendbirdData?.sender?.nickname || "";
  const channelType =
    sendbirdData?.channel?.custom_type || sendbirdData?.channel?.customType;
  const isDM =
    typeof channelType === "string" &&
    channelType.toUpperCase().startsWith("DM");

  const sendbirdType = String(
    sendbirdData?.type ||
      sendbirdData?.message_type ||
      sendbirdData?.messageType ||
      ""
  ).toUpperCase();
  const isFileMessage =
    sendbirdType === "FILE" ||
    (Array.isArray(sendbirdData?.files) && sendbirdData.files.length > 0);

  let body = "";
  if (isFileMessage) {
    body = isDM
      ? "Received an attachment 📎"
      : senderName
        ? `${senderName}: Received an attachment 📎`
        : "Received an attachment 📎";
  } else if (sendbirdData?.custom_type === "MESSAGE_GIF") {
    body = isDM
      ? "Received a GIF 🎞️"
      : senderName
        ? `${senderName}: Received a GIF 🎞️`
        : "Received a GIF 🎞️";
  } else if (sendbirdData?.custom_type === "MEETING_INVITE") {
    body = isDM
      ? "Invited you to a meeting"
      : senderName
        ? `${senderName}: Invited you to a meeting`
        : "Invited you to a meeting";
  } else {
    body = sendbirdData?.message ? stripHtml(sendbirdData.message) : "";
    if (senderName && body) {
      const senderPrefix = `${senderName}:`;
      if (isDM) {
        if (body.startsWith(senderPrefix)) {
          body = body.substring(senderPrefix.length).trim();
        }
      } else if (!body.startsWith(senderPrefix)) {
        body = `${senderName}: ${body}`;
      }
    }
    if (!body.trim()) {
      body = "New message";
    }
  }

  const title = isDM
    ? senderName || sendbirdData.channel?.name || "New Message"
    : sendbirdData.channel?.name || "New Message";

  return {
    title,
    body: body.trim() || "New message",
    channelUrl: sendbirdData.channel?.channel_url
  };
}

export async function displaySendbirdFcmNotificationFast(
  remoteMessage: RemoteMessage,
  data: Record<string, string>,
  sendbirdData: SendbirdFcmPayload
): Promise<boolean> {
  if (AppState.currentState === "active") {
    logRelease("🚫 [FCM Fast] skip — foreground, SDK owns display", {
      messageId: sendbirdData.message_id
    });
    return true;
  }

  if (!sendbirdData.message_id) {
    logRelease("🚫 [FCM Fast] missing message_id");
    return false;
  }

  if (shouldSkipSendbirdNotificationDisplay(sendbirdData.message_id, "fcm")) {
    const inFlightHolder = getSendbirdNotificationInFlightSource(
      sendbirdData.message_id
    );
    const alreadyDisplayed = wasSendbirdNotificationDisplayed(
      sendbirdData.message_id
    );
    logRelease(
      alreadyDisplayed || inFlightHolder === "sdk"
        ? "🚫 [fcm Fast] skip — already displayed by sdk"
        : "🚫 [fcm Fast] skip — already shown or in-flight",
      {
        messageId: sendbirdData.message_id,
        alreadyDisplayed,
        inFlightHolder
      }
    );
    logAndroidFcmProcessorStep("skip_fcm_dedupe", {
      messageId: sendbirdData.message_id
    });
    return true;
  }

  if (shouldBlockSendbirdNotificationFromFcmPayload(sendbirdData)) {
    logRelease("🚫 [FCM Fast] blocked by cached notification prefs", {
      messageId: sendbirdData.message_id
    });
    return true;
  }

  const { title, body, channelUrl } = buildSendbirdTitleBodyFromFcm(sendbirdData);
  if (!title && !body) {
    logRelease("🚫 [FCM Fast] empty title/body");
    return false;
  }

  const posted = await postSendbirdChatNotificationFast({
    messageId: sendbirdData.message_id,
    title,
    body,
    channelUrl: channelUrl ?? "",
    source: "fcm",
    data
  });

  if (posted) {
    logAndroidFcmProcessorStep("fast_display_ok", {
      messageId: sendbirdData.message_id,
      title
    });
  }

  return posted;
}

export { syncAndroidChatNotificationPrefsFromUser, getAndroidChatNotificationPrefs };
