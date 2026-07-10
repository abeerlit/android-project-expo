import { Platform } from "react-native";

function isAndroidVoipOrNotificationsEnabled(): boolean {
  return (
    process.env.EXPO_PUBLIC_NATIVE_TELEPHONY === "1" ||
    process.env.EXPO_PUBLIC_NATIVE_TELEPHONY === "true" ||
    process.env.EXPO_PUBLIC_NATIVE_NOTIFICATIONS === "1" ||
    process.env.EXPO_PUBLIC_NATIVE_NOTIFICATIONS === "true"
  );
}

/**
 * Register FCM background handler when native telephony or notifications are enabled.
 * Background incoming calls require this (native VoxoConnectFirebaseService skips when React is alive).
 */
export function registerAndroidFcmBackgroundHandler(): void {
  if (Platform.OS !== "android") return;
  if (!isAndroidVoipOrNotificationsEnabled()) return;

  try {
    require("./androidFcmBackgroundHandler.ts").registerAndroidFcmBackgroundHandlerImpl();
    console.log("[expo-shell] Android FCM background handler registered");
  } catch (e) {
    console.warn("[expo-shell] FCM background handler skipped:", e);
  }
}
