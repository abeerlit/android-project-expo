import { Platform } from "react-native";
import { createMMKV } from "react-native-mmkv";
import type { User } from "shared/api/users/types.ts";

type SendbirdFcmChannelPrefs = {
  custom_type?: string;
  customType?: string;
};

const storage = createMMKV({ id: "android-chat-notif-prefs" });
const PREFS_KEY = "prefs_v1";

export type AndroidChatNotificationPrefs = {
  enableChatNotifications: number;
  enableAllNewMessageNotifications: number;
  enableDirectMessageNotifications: number;
  tenantId: number | null;
};

export function syncAndroidChatNotificationPrefsFromUser(
  user: User | null | undefined
): void {
  if (Platform.OS !== "android" || !user) {
    return;
  }
  const prefs: AndroidChatNotificationPrefs = {
    enableChatNotifications: user.enableChatNotifications ?? 0,
    enableAllNewMessageNotifications:
      user.enableAllNewMessageNotifications ?? 0,
    enableDirectMessageNotifications:
      user.enableDirectMessageNotifications ?? 0,
    tenantId: user.tenantId ?? null
  };
  storage.set(PREFS_KEY, JSON.stringify(prefs));
}

export function getAndroidChatNotificationPrefs(): AndroidChatNotificationPrefs | null {
  if (Platform.OS !== "android") {
    return null;
  }
  const raw = storage.getString(PREFS_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as AndroidChatNotificationPrefs;
  } catch {
    return null;
  }
}

export function clearAndroidChatNotificationPrefs(): void {
  if (Platform.OS !== "android") {
    return;
  }
  storage.remove(PREFS_KEY);
}

/** FCM fast path: block display using MMKV-cached prefs (no Redux rehydrate). */
export function shouldBlockSendbirdFcmFromPrefsCache(sendbirdData: {
  channel?: SendbirdFcmChannelPrefs;
}): boolean {
  const user = getAndroidChatNotificationPrefs();
  if (!user) {
    return false;
  }
  return shouldBlockSendbirdForPrefs(user, sendbirdData);
}

export function shouldBlockSendbirdForPrefs(
  user: AndroidChatNotificationPrefs,
  sendbirdData: { channel?: SendbirdFcmChannelPrefs }
): boolean {
  if (user.enableChatNotifications !== 1) {
    return true;
  }

  const tenantId = user.tenantId;
  if (tenantId == null) {
    return false;
  }

  const channelType =
    sendbirdData?.channel?.custom_type || sendbirdData?.channel?.customType;
  const isGroupChannel = channelType === `Open_${tenantId}`;
  const isDM =
    channelType === `DM_${tenantId}` ||
    channelType === `DM_${tenantId}_PERSONAL` ||
    (typeof channelType === "string" &&
      channelType.toUpperCase().startsWith("DM_"));

  if (user.enableDirectMessageNotifications === 1 && isGroupChannel) {
    return true;
  }

  if (user.enableDirectMessageNotifications !== 1) {
    if (user.enableAllNewMessageNotifications !== 1 && !isDM) {
      return true;
    }
  }

  return false;
}
