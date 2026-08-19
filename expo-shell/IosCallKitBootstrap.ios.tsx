/**
 * Parity with bare Entrypoint.tsx: sync PushKit/CallKit UserDefaults from Redux after login.
 */
import { useEffect } from "react";
import { Platform } from "react-native";
import {
  installRecentsEarlyCapture,
  primeIosCallKitModule
} from "../src/core/softphone/iosRecentsEarly";
import {
  getVoxoNotificationsModule,
  syncIosNativeCallFlags
} from "./iosNativeCallModule.ts";

const IOS_APP_NAME = "VOXOConnect";

type UserSlice = {
  userReducer: {
    user: { enableMobileCallNotifications?: number } | null;
  };
};

export function IosCallKitBootstrap({
  useSelector
}: {
  useSelector: <T,>(fn: (s: UserSlice) => T) => T;
}) {
  const user = useSelector((s: UserSlice) => s.userReducer.user);

  useEffect(() => {
    syncIosNativeCallFlags();
  }, []);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    const mod = getVoxoNotificationsModule();
    if (!mod?.setEnableMobileCallNotifications) return;
    const enabled = !user || user.enableMobileCallNotifications !== 0;
    mod.setEnableMobileCallNotifications(enabled);
  }, [user?.enableMobileCallNotifications, user]);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    void (async () => {
      try {
        await primeIosCallKitModule(IOS_APP_NAME);
        installRecentsEarlyCapture();
      } catch (e) {
        console.warn("[expo-shell] iOS CallKit prime failed:", e);
      }
    })();
  }, []);

  return null;
}
