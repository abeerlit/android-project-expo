import { NativeModules, Platform } from "react-native";
import { findContactByPhoneNumber } from "features/calling/utils/contact-lookup.ts";
import { store } from "store/global-store.ts";
import { normalizePhoneNumber } from "shared/utils/phone-contacts.ts";
import { formatPhoneNumber, isValidPhoneNumber } from "shared/utils/formatters.ts";
import type { State } from "store/types.ts";
import type { DirectoryState } from "store/directory/reducers.ts";
import type { TextConversation } from "shared/api/messaging/types.ts";

type VoxoConnectAndroidNotificationsNative = {
  getDeviceContactNameForPhone?: (phoneNumber: string) => string | null;
  getSmsConversationTitle?: (conversationId: string) => string | null;
};

function getNativeNotificationsModule(): VoxoConnectAndroidNotificationsNative | null {
  if (Platform.OS !== "android") {
    return null;
  }
  return NativeModules.VoxoConnectAndroidNotifications ?? null;
}

/** True for US-style peer numbers (10 digits, or 11 with leading 1). */
export function looksLikePhoneNumber(value: string | undefined | null): boolean {
  if (!value?.trim()) {
    return false;
  }
  return isValidPhoneNumber(value.trim());
}

function normalizeDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Skip FCM `message.from` (project sender), not the SMS peer. */
function isFcmSenderId(
  candidate: string | undefined | null,
  fcmSenderId?: string
): boolean {
  if (!candidate?.trim() || !fcmSenderId?.trim()) {
    return false;
  }
  return normalizeDigits(candidate) === normalizeDigits(fcmSenderId);
}

/** True when value is empty, equals from, or looks like a phone number. */
export function isPhoneLikeName(
  value: string | undefined | null,
  from?: string
): boolean {
  if (!value?.trim()) {
    return true;
  }
  const trimmed = value.trim();
  if (from && normalizePhoneNumber(trimmed) === normalizePhoneNumber(from)) {
    return true;
  }
  return looksLikePhoneNumber(trimmed);
}

export type SmsSenderPhoneSources = {
  from?: string;
  peerName?: string | null;
  systemNotificationTitle?: string;
  notificationBody?: string;
  conversationId?: string | number | null;
  fcmSenderId?: string;
};

function findTextConversation(
  conversationId: string | number | null | undefined
): TextConversation | undefined {
  if (conversationId == null || conversationId === "") {
    return undefined;
  }
  const id =
    typeof conversationId === "number"
      ? conversationId
      : parseInt(String(conversationId), 10);
  if (Number.isNaN(id)) {
    return undefined;
  }
  const state = store.getState() as State;
  const conversations = [
    ...(state.textReducer?.conversations || []),
    ...(state.textReducer?.hiddenConversations || [])
  ];
  return conversations.find((c) => c.id === id);
}

function getSmsConversationDisplayTitle(
  conversationId: string | number | null | undefined,
  directory: DirectoryState
): string | null {
  const conv = findTextConversation(conversationId);
  if (!conv) {
    return null;
  }

  if (conv.conversationName?.trim()) {
    return conv.conversationName.trim();
  }

  const participants =
    conv.participants
      ?.split(",")
      .map((p) => p.trim())
      .filter((p) => p && p !== conv.sourceDID) ?? [];

  if (participants.length === 0) {
    return null;
  }

  const names = participants.map((phoneNumber) => {
    const contactInfo = findContactByPhoneNumber(
      phoneNumber,
      directory.personalContacts || [],
      directory.companyContacts || [],
      directory.directory || [],
      directory.phoneContacts || []
    );
    return contactInfo?.name || formatPhoneNumber(phoneNumber);
  });

  return names.join(", ") || null;
}

export function extractSmsSenderPhone(sources: SmsSenderPhoneSources): string {
  const ordered = [sources.from, sources.systemNotificationTitle];

  for (const candidate of ordered) {
    if (
      candidate &&
      looksLikePhoneNumber(candidate) &&
      !isFcmSenderId(candidate, sources.fcmSenderId)
    ) {
      return candidate.trim();
    }
  }

  const body = sources.notificationBody?.trim() || "";
  const colonIndex = body.indexOf(":");
  if (colonIndex > 0) {
    const prefix = body.substring(0, colonIndex).trim();
    if (looksLikePhoneNumber(prefix)) {
      return prefix;
    }
  }

  const conv = findTextConversation(sources.conversationId);
  if (conv?.participants) {
    const participants = conv.participants
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p && p !== conv.sourceDID);
    for (const phone of participants) {
      if (looksLikePhoneNumber(phone)) {
        return phone;
      }
    }
  }

  return "";
}

export function getSmsFcmSenderPhone(
  data: Record<string, string | undefined> | undefined | null
): string | undefined {
  if (!data) {
    return undefined;
  }
  return data.senderPhone || data.from;
}

export function resolveSmsSenderDisplayName(
  from: string | undefined,
  peerName?: string | null,
  options?: {
    directory?: DirectoryState;
    fallbackTitle?: string;
    systemNotificationTitle?: string;
    notificationBody?: string;
    conversationId?: string | number | null;
    fcmSenderId?: string;
    useNativeDeviceLookup?: boolean;
  }
): string {
  const fallback = options?.fallbackTitle ?? "New Message";

  const phone = extractSmsSenderPhone({
    from,
    systemNotificationTitle: options?.systemNotificationTitle,
    notificationBody: options?.notificationBody,
    conversationId: options?.conversationId,
    fcmSenderId: options?.fcmSenderId
  });

  const conversationId = options?.conversationId;
  if (conversationId != null && conversationId !== "") {
    const directory =
      options?.directory ?? (store.getState() as State)?.directoryReducer;
    const conversationTitle = getSmsConversationDisplayTitle(
      conversationId,
      directory
    );
    if (conversationTitle) {
      return conversationTitle;
    }

    if (Platform.OS === "android" && options?.useNativeDeviceLookup !== false) {
      try {
        const nativeConvTitle =
          getNativeNotificationsModule()?.getSmsConversationTitle?.(
            String(conversationId)
          );
        if (nativeConvTitle?.trim()) {
          return nativeConvTitle.trim();
        }
      } catch {
        /* ignore */
      }
    }
  }

  const directory =
    options?.directory ?? (store.getState() as State)?.directoryReducer;

  if (phone && directory) {
    const contactInfo = findContactByPhoneNumber(
      phone,
      directory.personalContacts || [],
      directory.companyContacts || [],
      directory.directory || [],
      directory.phoneContacts || []
    );
    if (contactInfo?.name) {
      return contactInfo.name;
    }
  }

  if (
    phone &&
    options?.useNativeDeviceLookup !== false &&
    Platform.OS === "android"
  ) {
    try {
      const nativeName =
        getNativeNotificationsModule()?.getDeviceContactNameForPhone?.(phone);
      if (nativeName?.trim()) {
        return nativeName.trim();
      }
    } catch {
      /* ignore */
    }
  }

  if (
    options?.systemNotificationTitle?.trim() &&
    !isPhoneLikeName(options.systemNotificationTitle, phone)
  ) {
    return options.systemNotificationTitle.trim();
  }

  if (phone) {
    try {
      return formatPhoneNumber(phone);
    } catch {
      return phone;
    }
  }

  return fallback;
}
