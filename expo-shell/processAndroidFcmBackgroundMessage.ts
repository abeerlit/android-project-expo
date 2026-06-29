/**
 * FCM background/killed handler for chat (Sendbird), SMS, voicemail, and defaults.
 * Display via Notifee runs before Redux/unread work so background JS is less likely to be killed mid-flight.
 */
import { AppState } from "react-native";
import {
  markSendbirdNotificationDisplayed,
  wasSendbirdNotificationDisplayed
} from "features/chat/utils/sendbirdNotificationDedupe.ts";
import {
  logAndroidFcmPayloadReceived,
  logAndroidFcmProcessorStep
} from "./androidFcmPayloadLogger.ts";
import { areSmsNotificationsEnabled } from "../src/core/notifications/smsNotificationPrefs.ts";
import { getAppNotificationsChannelName } from "shared/branding/appBrand.ts";
import {
  handleAndroidSmsFcm
} from "../src/core/notifications/androidSmsFcmDisplay.ts";
import {
  shouldBlockSendbirdForPrefs,
  getAndroidChatNotificationPrefs
} from "core/notifications/androidChatNotificationPrefsCache.ts";
import {
  displaySendbirdFcmNotificationFast,
  parseSendbirdFromFcmData,
  type SendbirdFcmPayload
} from "./fcmSendbirdFastDisplay.ts";

const LOG_RELEASE = true;
const REHYDRATE_MAX_MS = 3000;

function logRelease(...args: unknown[]) {
  if (LOG_RELEASE) {
    console.log(...args);
  }
}

type RemoteMessage = {
  messageId?: string;
  from?: string;
  data?: Record<string, string>;
  notification?: { title?: string; body?: string };
};

type SendbirdPayload = {
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

function parseSendbirdData(data: Record<string, string>): SendbirdPayload | null {
  try {
    const raw = data.sendbird;
    if (!raw) return null;
    return (
      typeof raw === "string" ? JSON.parse(raw) : raw
    ) as SendbirdPayload;
  } catch (e) {
    console.error("❌ [FCM Background] Error parsing sendbird data:", e);
    return null;
  }
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, "").trim();
}

function buildSendbirdTitleBody(sendbirdData: SendbirdPayload): {
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
    body,
    channelUrl: sendbirdData.channel?.channel_url
  };
}

function shouldBlockSendbirdForUserPrefs(
  user: {
    enableChatNotifications?: number;
    enableAllNewMessageNotifications?: number;
    enableDirectMessageNotifications?: number;
    tenantId?: number;
  },
  sendbirdData: SendbirdPayload
): boolean {
  return shouldBlockSendbirdForPrefs(
    {
      enableChatNotifications: user.enableChatNotifications ?? 0,
      enableAllNewMessageNotifications:
        user.enableAllNewMessageNotifications ?? 0,
      enableDirectMessageNotifications:
        user.enableDirectMessageNotifications ?? 0,
      tenantId: user.tenantId ?? null
    },
    sendbirdData
  );
}

async function ensureNotificationChannels(
  notifee: typeof import("@notifee/react-native").default,
  AndroidImportance: typeof import("@notifee/react-native").AndroidImportance
) {
  await notifee.createChannel({
    id: "voxo-notifications",
    name: getAppNotificationsChannelName(),
    importance: AndroidImportance.HIGH,
    vibration: true,
    sound: "default"
  });
  await notifee.createChannel({
    id: "voxo-sms-v2",
    name: "SMS Messages",
    importance: AndroidImportance.HIGH,
    vibration: true,
    sound: "default"
  });
}

async function awaitRehydrateBounded(rehydratePromise: Promise<void>) {
  try {
    await Promise.race([
      rehydratePromise,
      new Promise<void>((resolve) => setTimeout(resolve, REHYDRATE_MAX_MS))
    ]);
    logRelease("📦 [FCM Background] rehydrate ready (or bounded wait elapsed)");
  } catch (e) {
    console.warn("[FCM Background] rehydratePromise failed:", e);
  }
}

function bumpSendbirdUnreadAfterDisplay(
  sendbirdData: SendbirdPayload,
  userId: number,
  store: { dispatch: (a: { type: string }) => void },
  sendbirdActions: {
    incrementChannelUnread: (url: string) => { type: string };
  },
  UnreadCountCache: typeof import("../src/features/chat/utils/unreadCountCache")
) {
  if (!sendbirdData?.channel?.channel_url || sendbirdData.message_id == null) {
    return;
  }
  const senderIdRaw = sendbirdData.sender?.userId ?? sendbirdData.sender?.id;
  const senderId = senderIdRaw != null ? String(senderIdRaw) : undefined;
  if (senderId !== undefined && senderId === String(userId)) {
    return;
  }
  const channelUrl = sendbirdData.channel.channel_url;
  if (
    !UnreadCountCache.tryConsumeSendbirdUnreadMessageDedupe(sendbirdData.message_id)
  ) {
    logRelease("⏭️ [FCM Background] unread bump skipped (deduped)", {
      messageId: sendbirdData.message_id
    });
    return;
  }
  try {
    store.dispatch(sendbirdActions.incrementChannelUnread(channelUrl));
    const currentCount = UnreadCountCache.getUnreadCount(channelUrl);
    UnreadCountCache.setUnreadCount(channelUrl, currentCount + 1);
    logRelease("📈 [FCM Background] unread bump (after display)", {
      channelUrl,
      messageId: sendbirdData.message_id
    });
  } catch (e) {
    console.warn("[FCM Background] unread bump failed:", e);
  }
}

async function completeSendbirdFcmSideEffects(
  sendbirdData: SendbirdFcmPayload
): Promise<void> {
  try {
    const { store, rehydratePromise } =
      require("store/global-store.ts") as typeof import("../src/store/global-store");
    const sendbirdActions = require("store/sendbird/actions.ts") as {
      incrementChannelUnread: (url: string) => { type: string };
    };
    const { UnreadCountCache } =
      require("features/chat/utils/unreadCountCache.ts") as typeof import("../src/features/chat/utils/unreadCountCache");

    await awaitRehydrateBounded(rehydratePromise);

    const state = store.getState() as {
      authReducer?: { isLoggedIn?: boolean };
      userReducer?: { user?: { id?: number } };
    };
    const user = state?.userReducer?.user;
    if (!state?.authReducer?.isLoggedIn || !user?.id) {
      logAndroidFcmProcessorStep("side_effects_skip_not_logged_in");
      return;
    }

    bumpSendbirdUnreadAfterDisplay(
      sendbirdData as SendbirdPayload,
      user.id,
      store,
      sendbirdActions,
      UnreadCountCache
    );

    try {
      const notifee = require("@notifee/react-native").default;
      const badge = (await notifee.getBadgeCount()) + 1;
      await notifee.setBadgeCount(badge);
    } catch (_e) {
      /* ignore */
    }

    logAndroidFcmProcessorStep("side_effects_done");
  } catch (e) {
    console.warn("[FCM Background] Sendbird side effects failed:", e);
  }
}

export async function processAndroidFcmBackgroundMessage(
  remoteMessage: RemoteMessage
): Promise<void> {
  logAndroidFcmPayloadReceived(remoteMessage, "processor_entry");

  const data = { ...(remoteMessage.data || {}) };
  const ignorePush =
    data.ignorePush === "true" || data.ignorePush === "1";
  const sendbirdDataFast = parseSendbirdFromFcmData(data);

  if (
    sendbirdDataFast &&
    !ignorePush &&
    AppState.currentState === "active"
  ) {
    logAndroidFcmProcessorStep("skip_foreground_sdk_owns_display", {
      messageId: sendbirdDataFast.message_id,
      appState: AppState.currentState
    });
    return;
  }

  if (sendbirdDataFast && !ignorePush) {
    const cachedPrefs = getAndroidChatNotificationPrefs();
    if (
      cachedPrefs &&
      shouldBlockSendbirdForPrefs(cachedPrefs, sendbirdDataFast)
    ) {
      logRelease("🚫 [FCM Background] Sendbird blocked by cached prefs (fast gate)");
      logAndroidFcmProcessorStep("skip_sendbird_prefs_cached");
      return;
    }

    logAndroidFcmProcessorStep("fast_path_start", {
      messageId: sendbirdDataFast.message_id
    });
    const shown = await displaySendbirdFcmNotificationFast(
      remoteMessage,
      data,
      sendbirdDataFast
    );
    if (shown) {
      void completeSendbirdFcmSideEffects(sendbirdDataFast);
      return;
    }
    logAndroidFcmProcessorStep("fast_path_failed_try_slow");
  }

  const notifee = require("@notifee/react-native").default;
  const { AndroidImportance } = require("@notifee/react-native");
  const { store, rehydratePromise } =
    require("store/global-store.ts") as typeof import("../src/store/global-store");
  const sendbirdActions = require("store/sendbird/actions.ts") as {
    incrementChannelUnread: (url: string) => { type: string };
  };
  const { UnreadCountCache } =
    require("features/chat/utils/unreadCountCache.ts") as typeof import("../src/features/chat/utils/unreadCountCache");

  const sendbirdData = parseSendbirdData(data);

  await awaitRehydrateBounded(rehydratePromise);
  logAndroidFcmProcessorStep("after_rehydrate", {
    appState: AppState.currentState
  });
  await ensureNotificationChannels(notifee, AndroidImportance);
  logAndroidFcmProcessorStep("channels_ready");

  const vmPayloadType = data.vm_payload_type ?? "";
  const clickAction = data.click_action ?? "";
  const isSms =
    clickAction === "TEXT-RECEIVED" ||
    !!data.conversationId ||
    !!data.conversation_id ||
    !!data.reference_id;

  const hasIdentifyingData =
    !!data.conversationId ||
    !!data.conversation_id ||
    !!data.reference_id ||
    !!data.sendbird ||
    !!data.channelUrl ||
    !!clickAction ||
    !!vmPayloadType;

  if (!hasIdentifyingData) {
    logRelease("🚫 [FCM Background] no identifying data — skip", {
      messageId: remoteMessage.messageId,
      dataKeys: Object.keys(data)
    });
    logAndroidFcmProcessorStep("skip_no_identifying_data");
    return;
  }

  const state = store.getState() as {
    authReducer?: { isLoggedIn?: boolean };
    userReducer?: { user?: Record<string, unknown> };
  };
  const isLoggedIn = state?.authReducer?.isLoggedIn;
  const user = state?.userReducer?.user as
    | {
        id?: number;
        enableChatNotifications?: number;
        enableAllNewMessageNotifications?: number;
        enableDirectMessageNotifications?: number;
        enableMobileTextNotifications?: number;
        tenantId?: number;
      }
    | undefined;

  if (!isLoggedIn || !user?.id) {
    logRelease("🚫 [FCM Background] user not logged in — skip display", {
      isLoggedIn,
      messageId: remoteMessage.messageId,
      hasUser: !!user
    });
    logAndroidFcmProcessorStep("skip_not_logged_in", { isLoggedIn });
    return;
  }

  if (isSms) {
    logRelease("📱 [FCM Background] SMS — JS handler (toggle controls tray)", {
      messageId: remoteMessage.messageId,
      smsEnabled: areSmsNotificationsEnabled(user.enableMobileTextNotifications),
      hasNotificationBlock: !!remoteMessage.notification
    });
    const smsResult = await handleAndroidSmsFcm(remoteMessage);
    logAndroidFcmProcessorStep("sms_js_handler", {
      messageId: remoteMessage.messageId,
      result: smsResult
    });
    return;
  }

  if (ignorePush) {
    logRelease("🔕 [FCM Background] ignorePush — badge only (non-SMS)", {
      messageId: remoteMessage.messageId
    });
    if (sendbirdData) {
      bumpSendbirdUnreadAfterDisplay(
        sendbirdData,
        user.id,
        store,
        sendbirdActions,
        UnreadCountCache
      );
    }
    try {
      const currentBadge = await notifee.getBadgeCount();
      await notifee.setBadgeCount(currentBadge + 1);
    } catch (_e) {
      /* ignore */
    }
    return;
  }

  const isVoicemail =
    vmPayloadType === "voicemail" ||
    vmPayloadType === "voicemail_notification" ||
    clickAction === "VOICEMAIL-RECEIVED" ||
    clickAction === "voicemail-received";

  if (isVoicemail) {
    const vmTitle =
      remoteMessage.notification?.title || data.title || "Voicemail received";
    const vmBody =
      remoteMessage.notification?.body || data.body || data.message || "";
    try {
      await notifee.displayNotification({
        id: remoteMessage.messageId || `vm-${Date.now()}`,
        title: vmTitle,
        body: vmBody,
        android: {
          channelId: "voxo-notifications",
          importance: AndroidImportance.HIGH,
          pressAction: { id: "default" },
          smallIcon: "ic_notification"
        },
        data: {
          ...data,
          click_action: "VOICEMAIL-RECEIVED",
          vm_payload_type: "voicemail"
        }
      });
      logRelease("✅ [FCM Background] voicemail notification displayed");
    } catch (e) {
      console.error("❌ [FCM Background] voicemail display failed:", e);
    }
    return;
  }

  let title = "";
  let body = "";
  const notificationData: Record<string, string> = { ...data };

  if (sendbirdData) {
    if (shouldBlockSendbirdForUserPrefs(user, sendbirdData)) {
      logRelease("🚫 [FCM Background] Sendbird blocked by user prefs");
      logAndroidFcmProcessorStep("skip_sendbird_prefs");
      return;
    }

    logRelease("💬 [FCM Background] Sendbird push", {
      channelUrl: sendbirdData.channel?.channel_url,
      messageId: sendbirdData.message_id,
      appState: AppState.currentState
    });

    const { title: sbTitle, body: sbBody, channelUrl } =
      buildSendbirdTitleBody(sendbirdData);
    title = sbTitle;
    body = sbBody;
    if (channelUrl) {
      notificationData.channelUrl = channelUrl;
      notificationData.click_action = "SENDBIRD-RECEIVED";
      notificationData.messageId = String(sendbirdData.message_id ?? "");
    }
  } else {
    title =
      remoteMessage.notification?.title || data.title || "New Message";
    body =
      remoteMessage.notification?.body || data.body || data.message || "";
  }

  if (!title && !body) {
    logRelease("🚫 [FCM Background] empty title/body — skip");
    return;
  }

  const notificationId = sendbirdData?.message_id
    ? `sendbird-${sendbirdData.message_id}`
    : remoteMessage.messageId || `fcm-${Date.now()}`;

  if (
    sendbirdData?.message_id != null &&
    wasSendbirdNotificationDisplayed(sendbirdData.message_id)
  ) {
    logRelease("🚫 [FCM Background] already displayed (memory dedupe)", {
      notificationId
    });
    logAndroidFcmProcessorStep("skip_memory_dedupe", { notificationId });
    return;
  }

  logRelease("🔔 [FCM Background] checking displayed notifications", {
    notificationId
  });
  const displayed = await notifee.getDisplayedNotifications();
  if (displayed.some((n) => n.id === notificationId)) {
    logRelease("🚫 [FCM Background] already displayed (Notifee)", {
      notificationId
    });
    logAndroidFcmProcessorStep("skip_notifee_dedupe", { notificationId });
    if (sendbirdData?.message_id != null) {
      markSendbirdNotificationDisplayed(sendbirdData.message_id);
    }
    return;
  }

  if (!isSms && remoteMessage.notification?.title) {
    const sysTitle = remoteMessage.notification.title;
    const sysBody = remoteMessage.notification.body;
    for (const n of displayed) {
      if (
        n.notification?.title === sysTitle &&
        n.notification?.body === sysBody
      ) {
        await notifee.cancelNotification(n.id);
        logRelease("🔕 [FCM Background] canceled system duplicate", {
          id: n.id
        });
        break;
      }
    }
  }

  let badgeCount = 1;
  try {
    badgeCount = (await notifee.getBadgeCount()) + 1;
  } catch (_e) {
    /* ignore */
  }

  const channelId = "voxo-notifications";

  logRelease("🔔 [FCM Background] posting Notifee notification", {
    notificationId,
    channelId
  });

  try {
    await notifee.displayNotification({
      id: notificationId,
      title,
      body,
      data: notificationData,
      android: {
        channelId,
        smallIcon: "ic_notification",
        importance: AndroidImportance.HIGH,
        pressAction: { id: "default" },
        badgeCount,
        number: badgeCount,
        sound: "default",
        vibrationPattern: [300, 500],
        showWhen: true,
        timestamp: Date.now(),
        autoCancel: true
      }
    });

    if (sendbirdData?.message_id != null) {
      markSendbirdNotificationDisplayed(sendbirdData.message_id);
    }

    try {
      await notifee.setBadgeCount(badgeCount);
    } catch (_e) {
      /* ignore */
    }

    logRelease("✅ [FCM Background] notification displayed", {
      notificationId,
      channelId,
      title,
      bodyPreview: body.substring(0, 60),
      isSendbird: !!sendbirdData
    });
    logAndroidFcmProcessorStep("display_ok", {
      notificationId,
      channelId,
      title,
      isSendbird: !!sendbirdData
    });
  } catch (e) {
    console.error("❌ [FCM Background] displayNotification failed:", e);
    logAndroidFcmProcessorStep("display_failed", {
      error: String(e),
      notificationId
    });
    return;
  }

  if (sendbirdData) {
    bumpSendbirdUnreadAfterDisplay(
      sendbirdData,
      user.id,
      store,
      sendbirdActions,
      UnreadCountCache
    );
  }
}
