/**
 * Notifee channels (parity with bare android-project/index.js) — run when notifications enabled.
 */
import { Platform } from "react-native";
import { getAppNotificationsChannelName } from "shared/branding/appBrand.ts";

export async function setupAndroidNotifeeChannels(): Promise<void> {
  if (Platform.OS !== "android") return;
  const notificationsOn =
    process.env.EXPO_PUBLIC_NATIVE_NOTIFICATIONS === "1" ||
    process.env.EXPO_PUBLIC_NATIVE_NOTIFICATIONS === "true" ||
    process.env.EXPO_PUBLIC_NATIVE_TELEPHONY === "1";
  if (!notificationsOn) return;

  try {
    const notifee = require("@notifee/react-native").default;
    const { AndroidImportance } = require("@notifee/react-native");
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
    await notifee.createChannel({
      id: "incoming-calls-v2",
      name: "Incoming Calls",
      importance: AndroidImportance.HIGH,
      vibration: true
    });
  } catch (e) {
    console.warn("[expo-shell] Notifee channels skipped:", e);
  }
}
