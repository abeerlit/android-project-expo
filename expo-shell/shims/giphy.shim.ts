/**
 * Safe Giphy entry: use the native SDK when linked, otherwise the JS stub.
 * Avoids TurboModuleRegistry.getEnforcing crashes when the module is missing
 * from the binary (dev builds, failed autolinking, 16 KB native load issues).
 */
import { Platform, TurboModuleRegistry } from "react-native";

const hasNative =
  Platform.OS !== "web" &&
  TurboModuleRegistry.get("RTNGiphySDKModule") != null;

function loadPackage() {
  if (hasNative) {
    return require("@giphy/react-native-sdk-real") as typeof import("@giphy/react-native-sdk");
  }
  if (__DEV__) {
    console.warn(
      "[expo-shell] Giphy native module missing — using JS stub. Rebuild with EXPO_PUBLIC_CHAT_NATIVE=1."
    );
  }
  return require("../stubs/giphy.stub.ts");
}

const pkg = loadPackage();

export const GiphyThemePreset = pkg.GiphyThemePreset;
export const GiphySDK = pkg.GiphySDK;
export const GiphyDialog = pkg.GiphyDialog;
export const GiphyDialogEvent = pkg.GiphyDialogEvent;
