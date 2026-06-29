/**
 * Use real Notifee when linked in the dev client; otherwise fall back to the JS stub
 * so Navigation/Home can load before a native rebuild.
 */
import { NativeModules, Platform } from "react-native";

const hasNative =
  Platform.OS !== "web" && NativeModules.NotifeeApiModule != null;

function loadPackage() {
  if (hasNative) {
    return require("@notifee/react-native-real");
  }
  if (__DEV__) {
    console.warn(
      "[expo-shell] Notifee native module missing — using JS stub. Rebuild the iOS dev client in Xcode (Product → Clean, then Run)."
    );
  }
  return require("../stubs/notifee.stub.ts");
}

const pkg = loadPackage();
export default pkg.default ?? pkg;
export const AndroidImportance = pkg.AndroidImportance;
export const EventType = pkg.EventType;
