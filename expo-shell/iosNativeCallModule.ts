import { NativeModules, Platform } from "react-native";
import { USE_VOXO_MOBILE_APPROACH } from "../src/core/config/callApproach";

export type VoxoNotificationsNativeModule = {
  setUseVoxoMobileCallApproach?: (value: boolean) => void;
  setEnableMobileCallNotifications?: (enabled: boolean) => void;
};

/** RCT_EXPORT_MODULE strips RCT prefix → VoxoNotificationsModule; keep fallback. */
export function getVoxoNotificationsModule(): VoxoNotificationsNativeModule | undefined {
  const modules = NativeModules as Record<string, VoxoNotificationsNativeModule | undefined>;
  return modules.VoxoNotificationsModule ?? modules.RCTVoxoNotificationsModule;
}

/**
 * Tells AppDelegate whether to report CallKit on foreground VoIP push (voxo-mobile path).
 * Call from index.js before React mounts so the first push sees the correct flag.
 */
export function syncIosNativeCallFlags(): void {
  if (Platform.OS !== "ios") return;
  const mod = getVoxoNotificationsModule();
  if (mod?.setUseVoxoMobileCallApproach) {
    mod.setUseVoxoMobileCallApproach(USE_VOXO_MOBILE_APPROACH);
    if (__DEV__) {
      console.warn(
        `[expo-shell] setUseVoxoMobileCallApproach(${USE_VOXO_MOBILE_APPROACH})`
      );
    }
  } else if (__DEV__) {
    console.warn(
      "[expo-shell] VoxoNotificationsModule missing — foreground VoIP may skip CallKit"
    );
  }
}
