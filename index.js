import "./expo-shell/setupDevLogBox.ts";
import "react-native-gesture-handler";
import "react-native-get-random-values";
import { AppRegistry, NativeModules, Platform } from "react-native";

const telephonyOn =
  process.env.EXPO_PUBLIC_NATIVE_TELEPHONY === "1" ||
  process.env.EXPO_PUBLIC_NATIVE_TELEPHONY === "true";

const meetingsOn =
  process.env.EXPO_PUBLIC_MEETINGS_NATIVE === "1" ||
  process.env.EXPO_PUBLIC_MEETINGS_NATIVE === "true";

if ((telephonyOn || meetingsOn) && NativeModules.WebRTCModule) {
  try {
    require("./expo-shell/setupWebRTCPolyfill.ts").runSetupWebRTCPolyfill();
  } catch (e) {
    console.warn("[expo-shell] early WebRTC polyfill skipped:", e);
  }
} else if ((telephonyOn || meetingsOn) && !NativeModules.WebRTCModule) {
  console.warn(
    "[expo-shell] WebRTC env flags are on but WebRTCModule is not linked — rebuild the dev client with EXPO_PUBLIC_MEETINGS_NATIVE=1 or EXPO_PUBLIC_NATIVE_TELEPHONY=1"
  );
}

if (Platform.OS === "ios" && telephonyOn) {
  try {
    require("./expo-shell/iosNativeCallModule.ts").syncIosNativeCallFlags();
    require("./expo-shell/iosCallKitEntryBootstrap").runIosCallKitEntryBootstrap();
  } catch (e) {
    console.warn("[expo-shell] iOS CallKit bootstrap skipped:", e);
  }
}

if (Platform.OS === "android") {
  require("./expo-shell/androidNotifeeChannels.ts").setupAndroidNotifeeChannels();
  require("./expo-shell/androidFcmBootstrap.ts").registerAndroidFcmBackgroundHandler();
}

import { enableScreens } from "react-native-screens";
import { registerRootComponent } from "expo";
import Constants from "expo-constants";
import BootProbe from "./expo-shell/BootProbe.tsx";
import DeferredEntry from "./expo-shell/DeferredEntry.tsx";

enableScreens(true);

const minimalBoot =
  process.env.EXPO_PUBLIC_MINIMAL_BOOT === "1" ||
  Constants.expoConfig?.extra?.EXPO_PUBLIC_MINIMAL_BOOT === true;

const Root = minimalBoot ? BootProbe : DeferredEntry;

registerRootComponent(Root);

/** Bare MainActivity (copied Kotlin) loads "VOXOConnect"; Expo registerRootComponent uses "main". */
function qualifyRoot() {
  if (process.env.NODE_ENV !== "production") {
    try {
      const { withDevTools } = require("expo/src/launch/withDevTools");
      return withDevTools(Root);
    } catch {
      return Root;
    }
  }
  return Root;
}

AppRegistry.registerComponent("VOXOConnect", () => qualifyRoot());

/** Killed-state SIP — must register on every Android bundle load (parity with bare index.js). */
if (Platform.OS === "android") {
  AppRegistry.registerHeadlessTask(
    "AndroidHandleSipCallHeadlessTask",
    () => require("./expo-shell/headless/AndroidHandleSipCallHeadlessTask").default
  );
  AppRegistry.registerHeadlessTask(
    "RNCallKeepBackgroundMessage",
    () => () => Promise.resolve()
  );
}
