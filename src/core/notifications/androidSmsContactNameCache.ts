import { NativeModules, Platform } from "react-native";
import { findContactByPhoneNumber } from "features/calling/utils/contact-lookup.ts";
import { normalizePhoneNumber } from "shared/utils/phone-contacts.ts";
import { formatPhoneNumber } from "shared/utils/formatters.ts";
import { store } from "store/global-store.ts";
import type { State } from "store/types.ts";
import type { DirectoryState } from "store/directory/reducers.ts";
import type { TextConversation } from "shared/api/messaging/types.ts";

type VoxoConnectAndroidNotificationsNative = {
  syncSmsContactNameCache?: (json: string) => void;
};

export type AndroidSmsNotificationCachePayload = {
  phones: Record<string, string>;
  conversations: Record<string, string>;
};

function cacheKeyForPhone(phoneNumber: string): string | null {
  const digits = normalizePhoneNumber(phoneNumber);
  if (!digits) {
    return null;
  }
  const last10 = digits.slice(-10);
  return last10.length === 10 ? last10 : digits;
}

function addPhoneToMap(
  map: Record<string, string>,
  phoneNumber: string | undefined | null,
  name: string
) {
  if (!phoneNumber?.trim() || !name.trim()) {
    return;
  }
  const key = cacheKeyForPhone(phoneNumber);
  if (!key || map[key]) {
    return;
  }
  map[key] = name.trim();
}

function addDirectDialsToMap(
  map: Record<string, string>,
  directDials: string[] | undefined,
  name: string
) {
  if (!directDials?.length) {
    return;
  }
  for (const dial of directDials) {
    addPhoneToMap(map, dial, name);
  }
}

export function buildSmsContactNameMap(
  directory: DirectoryState
): Record<string, string> {
  const map: Record<string, string> = {};

  for (const contact of directory.personalContacts || []) {
    addPhoneToMap(map, contact.number, contact.name);
  }

  for (const contact of directory.companyContacts || []) {
    addPhoneToMap(map, contact.number, contact.name);
    addDirectDialsToMap(map, contact.directDials, contact.name);
  }

  for (const contact of directory.directory || []) {
    addPhoneToMap(map, contact.number, contact.name);
    addDirectDialsToMap(map, contact.directDials, contact.name);
  }

  for (const contact of directory.phoneContacts || []) {
    const name = contact.displayName?.trim();
    if (!name) {
      continue;
    }
    for (const phone of contact.phoneNumbers || []) {
      addPhoneToMap(map, phone.number, name);
    }
  }

  return map;
}

function conversationDisplayTitle(
  conv: TextConversation,
  directory: DirectoryState
): string | null {
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
    try {
      return contactInfo?.name || formatPhoneNumber(phoneNumber);
    } catch {
      return contactInfo?.name || phoneNumber;
    }
  });

  return names.join(", ") || null;
}

export function buildSmsConversationTitleMap(
  conversations: TextConversation[],
  directory: DirectoryState
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const conv of conversations) {
    const title = conversationDisplayTitle(conv, directory);
    if (title) {
      map[String(conv.id)] = title;
    }
  }
  return map;
}

export function buildAndroidSmsNotificationCachePayload(
  state?: State
): AndroidSmsNotificationCachePayload {
  const snap = state ?? (store.getState() as unknown as State);
  const directory = snap.directoryReducer;
  const text = snap.textReducer;
  const conversations = [
    ...(text?.conversations || []),
    ...(text?.hiddenConversations || [])
  ];

  return {
    phones: buildSmsContactNameMap(directory),
    conversations: buildSmsConversationTitleMap(conversations, directory)
  };
}

export function syncSmsContactNameCacheFromDirectory(
  directory: DirectoryState | undefined | null,
  conversations?: TextConversation[]
): void {
  if (Platform.OS !== "android" || !directory) {
    return;
  }
  const mod = NativeModules.VoxoConnectAndroidNotifications as
    | VoxoConnectAndroidNotificationsNative
    | undefined;
  if (!mod?.syncSmsContactNameCache) {
    return;
  }
  try {
    const payload: AndroidSmsNotificationCachePayload = {
      phones: buildSmsContactNameMap(directory),
      conversations: buildSmsConversationTitleMap(conversations || [], directory)
    };
    mod.syncSmsContactNameCache(JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function syncSmsContactNameCacheFromStore(): void {
  if (Platform.OS !== "android") {
    return;
  }
  const mod = NativeModules.VoxoConnectAndroidNotifications as
    | VoxoConnectAndroidNotificationsNative
    | undefined;
  if (!mod?.syncSmsContactNameCache) {
    return;
  }
  try {
    const payload = buildAndroidSmsNotificationCachePayload();
    mod.syncSmsContactNameCache(JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}
