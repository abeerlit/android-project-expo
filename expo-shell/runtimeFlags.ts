import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | boolean>;

function flag(name: string, defaultValue = false): boolean {
  const env = process.env[name];
  if (env === "1" || env === "true") return true;
  if (env === "0" || env === "false") return false;
  const fromExtra = extra[name];
  if (fromExtra === true || fromExtra === "1" || fromExtra === "true") return true;
  if (fromExtra === false || fromExtra === "0" || fromExtra === "false") return false;
  return defaultValue;
}

/** Phase 0: UI shell without CallKit / VoIP / custom native modules. */
export const NATIVE_TELEPHONY_ENABLED = flag("EXPO_PUBLIC_NATIVE_TELEPHONY", false);

/** Phase 3+: FCM, Notifee, VoxoNotificationsModule. */
export const NATIVE_NOTIFICATIONS_ENABLED = flag(
  "EXPO_PUBLIC_NATIVE_NOTIFICATIONS",
  NATIVE_TELEPHONY_ENABLED
);

/** Phase 6+: Sendbird + rich editor assets. */
export const CHAT_NATIVE_ENABLED = flag("EXPO_PUBLIC_CHAT_NATIVE", false);

/** Phase 7+: Daily meetings + screen share extension. */
export const MEETINGS_NATIVE_ENABLED = flag(
  "EXPO_PUBLIC_MEETINGS_NATIVE",
  NATIVE_TELEPHONY_ENABLED
);
