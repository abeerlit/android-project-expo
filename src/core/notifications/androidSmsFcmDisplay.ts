/**
 * Android SMS FCM — JS owns all tray UI (foreground, background, killed).
 *
 * Backend contract: see smsNotificationPrefs.ts
 */
import notifee, { AndroidImportance } from "@notifee/react-native";
import { NativeModules } from "react-native";
import { store } from "store/global-store.ts";
import { areSmsNotificationsEnabled } from "./smsNotificationPrefs.ts";
import { resolveSmsSenderDisplayName, getSmsFcmSenderPhone } from "./resolveSmsSenderDisplayName.ts";

type AndroidNotificationsNative = {
  cancelSmsSystemTrayNotification?: (
    title: string,
    body: string,
    messageId: string | null
  ) => boolean;
};

function getAndroidNotificationsModule(): AndroidNotificationsNative | undefined {
  return NativeModules.VoxoConnectAndroidNotifications as
    | AndroidNotificationsNative
    | undefined;
}

/** Best-effort cancel if the OS auto-posted an FCM `notification` block before JS ran. */
function cancelOsSmsTrayIfPresent(remoteMessage: {
  messageId?: string;
  notification?: { title?: string; body?: string };
}): void {
  const title = remoteMessage.notification?.title?.trim();
  if (!title) {
    return;
  }
  const body = remoteMessage.notification?.body?.trim() ?? "";
  const messageId = remoteMessage.messageId?.trim() ?? null;
  try {
    getAndroidNotificationsModule()?.cancelSmsSystemTrayNotification?.(
      title,
      body,
      messageId
    );
  } catch {
    /* ignore */
  }
}

export function parseFcmIgnorePush(
  data: Record<string, unknown> | undefined
): boolean {
  const v = data?.ignorePush;
  if (typeof v === "string") return v === "true" || v === "1";
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1;
  return false;
}

export function isSmsFcmPayload(
  data: Record<string, string> | undefined
): boolean {
  if (!data) return false;
  return (
    data.click_action === "TEXT-RECEIVED" ||
    !!data.conversationId ||
    !!data.conversation_id ||
    !!data.reference_id ||
    data.vm_payload_type === "text-notification"
  );
}

export async function cancelFcmSmsSystemNotification(
  remoteMessage: {
    messageId?: string;
    notification?: { title?: string; body?: string };
  }
): Promise<void> {
  const sysTitle = remoteMessage.notification?.title;
  const sysBody = remoteMessage.notification?.body;
  const messageId = remoteMessage.messageId;

  try {
    const displayed = await notifee.getDisplayedNotifications();
    for (const n of displayed) {
      if (messageId && n.id === messageId) {
        await notifee.cancelNotification(n.id);
        continue;
      }
      if (
        sysTitle &&
        n.notification?.title === sysTitle &&
        (sysBody == null || n.notification?.body === sysBody)
      ) {
        await notifee.cancelNotification(n.id);
      }
    }
  } catch {
    /* best-effort */
  }
}

async function ensureSmsChannel(): Promise<string> {
  return notifee.createChannel({
    id: "voxo-sms-v2",
    name: "SMS Messages",
    importance: AndroidImportance.HIGH,
    vibration: true,
    sound: "default"
  });
}

export function buildSmsTitleBody(
  remoteMessage: {
    from?: string;
    notification?: { title?: string; body?: string };
    data?: Record<string, string>;
  },
  data: Record<string, string>
): { title: string; body: string } {
  const senderPhone = getSmsFcmSenderPhone(data);
  const title = resolveSmsSenderDisplayName(senderPhone, undefined, {
    systemNotificationTitle:
      remoteMessage.notification?.title || data.title,
    notificationBody:
      remoteMessage.notification?.body || data.text || data.body,
    conversationId:
      data.reference_id || data.conversationId || data.conversation_id,
    fcmSenderId: remoteMessage.from
  });
  let body =
    remoteMessage.notification?.body ||
    data.text ||
    data.body ||
    data.message ||
    "";
  const colonIndex = body.indexOf(":");
  if (colonIndex > 0) {
    body = body.substring(colonIndex + 1).trim();
  }
  if (!body.trim()) {
    body = "New message";
  }
  return { title, body };
}

export type AndroidSmsFcmHandleResult = "displayed" | "badge_only" | "skipped";

/**
 * Single SMS handler for background/killed (and callable from foreground).
 * Toggle OFF → Redux + badge only (expect data-only FCM).
 * Toggle ON → one Notifee notification with resolved contact name.
 */
export async function handleAndroidSmsFcm(
  remoteMessage: {
    messageId?: string;
    from?: string;
    notification?: { title?: string; body?: string };
    data?: Record<string, string>;
  },
  options?: { skipRedux?: boolean }
): Promise<AndroidSmsFcmHandleResult> {
  const data = { ...(remoteMessage.data || {}) };
  if (!isSmsFcmPayload(data)) {
    return "skipped";
  }

  const user = (
    store.getState() as {
      userReducer?: { user?: { enableMobileTextNotifications?: number } };
    }
  )?.userReducer?.user;

  if (!options?.skipRedux) {
    try {
      const { handleTextNotification } = require("./TextNotificationHandler.ts");
      handleTextNotification(remoteMessage);
    } catch {
      /* ignore */
    }
  }

  try {
    const currentBadge = await notifee.getBadgeCount();
    await notifee.setBadgeCount(currentBadge + 1);
  } catch {
    /* ignore */
  }

  if (parseFcmIgnorePush(data)) {
    console.log("📱 [androidSmsFcmDisplay] ignorePush=true — badge/Redux only", {
      messageId: remoteMessage.messageId
    });
    return "badge_only";
  }

  const smsEnabled = areSmsNotificationsEnabled(
    user?.enableMobileTextNotifications
  );

  if (!smsEnabled) {
    console.log("📱 [androidSmsFcmDisplay] SMS toggle OFF — badge/Redux only", {
      messageId: remoteMessage.messageId,
      hasNotificationBlock: !!remoteMessage.notification
    });
    return "badge_only";
  }

  const notificationId = remoteMessage.messageId || `sms-${Date.now()}`;
  try {
    const displayed = await notifee.getDisplayedNotifications();
    if (displayed.some((n) => n.id === notificationId)) {
      console.log("📱 [androidSmsFcmDisplay] SMS already displayed", {
        notificationId
      });
      return "displayed";
    }
  } catch {
    /* ignore */
  }

  if (remoteMessage.notification?.title || remoteMessage.notification?.body) {
    cancelOsSmsTrayIfPresent(remoteMessage);
    await cancelFcmSmsSystemNotification(remoteMessage);
  }

  const shown = await displaySmsNotifeeFromFcm(remoteMessage);
  return shown ? "displayed" : "skipped";
}

/** Post one SMS tray notification (toggle must be ON). */
export async function displaySmsNotifeeFromFcm(remoteMessage: {
  messageId?: string;
  from?: string;
  notification?: { title?: string; body?: string };
  data?: Record<string, string>;
}): Promise<boolean> {
  const data = { ...(remoteMessage.data || {}) };
  const user = (
    store.getState() as {
      userReducer?: { user?: { enableMobileTextNotifications?: number } };
    }
  )?.userReducer?.user;

  if (!areSmsNotificationsEnabled(user?.enableMobileTextNotifications)) {
    return false;
  }

  if (parseFcmIgnorePush(data)) {
    return false;
  }

  const { title, body } = buildSmsTitleBody(remoteMessage, data);
  const channelId = await ensureSmsChannel();
  const notificationId = remoteMessage.messageId || `sms-${Date.now()}`;
  const referenceId =
    data.reference_id || data.conversationId || data.conversation_id || "";

  await notifee.displayNotification({
    id: notificationId,
    title,
    body,
    data: {
      ...data,
      click_action: data.click_action || "TEXT-RECEIVED",
      ...(referenceId ? { reference_id: referenceId } : {})
    },
    android: {
      channelId,
      smallIcon: "ic_notification",
      importance: AndroidImportance.HIGH,
      pressAction: { id: "default" },
      timestamp: Date.now(),
      autoCancel: true
    }
  });

  console.log("✅ [androidSmsFcmDisplay] SMS Notifee displayed", {
    notificationId,
    title,
    bodyPreview: body.substring(0, 40)
  });
  return true;
}
