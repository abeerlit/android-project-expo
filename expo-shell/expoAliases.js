const fs = require("fs");
const path = require("path");
const {
  applyUnlinkedNativeAliases,
  resolveUnlinkedNativeStub
} = require("./unlinkedNativeModules.js");

function envOn(name) {
  const v = process.env[name];
  return v === "1" || v === "true";
}

/** Stubs heavy native stacks until plugins + env flags are enabled. */
function useExpoNativeStubs() {
  const telephony = envOn("EXPO_PUBLIC_NATIVE_TELEPHONY");
  const notifications =
    envOn("EXPO_PUBLIC_NATIVE_NOTIFICATIONS") || telephony;
  return !notifications;
}

function useExpoTelephonyStub() {
  return !envOn("EXPO_PUBLIC_NATIVE_TELEPHONY");
}

function useExpoMeetingsStub() {
  return !envOn("EXPO_PUBLIC_MEETINGS_NATIVE");
}

function useExpoChatStub() {
  return !envOn("EXPO_PUBLIC_CHAT_NATIVE");
}

/** Stub RN packages not linked in the current dev client (default on). */
function useExpoUnlinkedNativeStubs() {
  if (envOn("EXPO_PUBLIC_DISABLE_NATIVE_STUBS")) return false;
  return !envOn("EXPO_PUBLIC_NATIVE_FULL");
}

const projectRoot = path.resolve(__dirname, "..");
const shimsDir = path.resolve(__dirname, "shims");

function getFirebaseMessagingStubPath() {
  return path.resolve(__dirname, "stubs/firebase-messaging.stub.ts");
}

/** Real packages resolved from shims (avoids alias loop). */
function getNativeRealAliases() {
  return {
    "react-native-mmkv-real": path.join(
      projectRoot,
      "node_modules/react-native-mmkv"
    ),
    "@notifee/react-native-real": path.join(
      projectRoot,
      "node_modules/@notifee/react-native"
    ),
    "@react-native-firebase/messaging-real": path.join(
      projectRoot,
      "node_modules/@react-native-firebase/messaging"
    ),
    "react-native-callkeep-real": path.join(
      projectRoot,
      "node_modules/react-native-callkeep"
    ),
    "react-native-voip-push-notification-real": path.join(
      projectRoot,
      "node_modules/react-native-voip-push-notification"
    ),
    "@react-native-community/push-notification-ios-real": path.join(
      projectRoot,
      "node_modules/@react-native-community/push-notification-ios"
    ),
    "react-native-incall-manager-real": path.join(
      projectRoot,
      "node_modules/react-native-incall-manager"
    ),
    "@giphy/react-native-sdk-real": path.join(
      projectRoot,
      "node_modules/@giphy/react-native-sdk"
    )
  };
}

/** Avoid TurboModuleRegistry.getEnforcing crash when native Giphy is not linked. */
function applyGiphyAlias(aliases) {
  aliases["@giphy/react-native-sdk"] = path.join(shimsDir, "giphy.shim.ts");
  aliases["@giphy/react-native-sdk-real"] = path.join(
    projectRoot,
    "node_modules/@giphy/react-native-sdk"
  );
}

function getWebrtcTrackEventAlias() {
  return path.join(
    projectRoot,
    "node_modules/@daily-co/react-native-webrtc/lib/module/RTCTrackEvent.js"
  );
}

function getWebrtcModuleEntry() {
  return path.join(
    projectRoot,
    "node_modules/@daily-co/react-native-webrtc/lib/module/index.js"
  );
}

/** Daily/WebRTC — required for meetings and/or telephony (SIP uses RTCTrackEvent subpath). */
function applyDailyWebRtcAliases(aliases) {
  const rtcTrackEvent = getWebrtcTrackEventAlias();
  aliases["@daily-co/react-native-webrtc/lib/typescript/RTCTrackEvent"] =
    rtcTrackEvent;
  aliases["@daily-co/react-native-daily-js"] = path.join(
    projectRoot,
    "node_modules/@daily-co/react-native-daily-js"
  );
}

function applyTelephonyAliases(aliases) {
  if (useExpoTelephonyStub()) return;
  Object.assign(aliases, getNativeRealAliases());
  applyDailyWebRtcAliases(aliases);
  aliases["react-native-callkeep"] = path.join(shimsDir, "callkeep.shim.ts");
  // iOS-only package — Android Expo shell always uses the platform shim (no npm install).
  aliases["react-native-voip-push-notification"] = path.join(
    shimsDir,
    "voip-push.shim.android.ts"
  );
  aliases["react-native-incall-manager"] = path.join(
    shimsDir,
    "incall-manager.shim.ts"
  );
}

function applyNotificationAliases(aliases, stubs) {
  if (useExpoNativeStubs()) {
    aliases["@react-native-firebase/messaging"] = getFirebaseMessagingStubPath();
    aliases["@notifee/react-native"] = stubs.notifee;
    aliases["core/notifications/NotificationManager.ts"] = stubs.notification;
    aliases["core/notifications/NotificationManager"] = stubs.notification;
    aliases["hooks/use-notifications.ts"] = stubs.useNotifications;
    aliases["hooks/use-notifications"] = stubs.useNotifications;
    return;
  }
  Object.assign(aliases, getNativeRealAliases());
  aliases["@notifee/react-native"] = path.join(shimsDir, "notifee.shim.ts");
  aliases["@react-native-firebase/messaging"] = path.join(
    shimsDir,
    "firebase-messaging.shim.ts"
  );
  aliases["@react-native-community/push-notification-ios"] = path.join(
    shimsDir,
    "push-notification-ios.shim.android.ts"
  );
}

function addScreenStubs(aliases, stubs) {
  if (useExpoChatStub()) {
    const sendbirdStub = stubs.sendbird;
    aliases["features/chat/utils/SendbirdContextProvider.tsx"] = sendbirdStub;
    aliases["features/chat/utils/SendbirdContextProvider"] = sendbirdStub;
    aliases["features/chat/pages/Chat.tsx"] = stubs.chatScreen;
    aliases["features/chat/pages/Chat"] = stubs.chatScreen;
    aliases["features/chat/pages/Threads.tsx"] = stubs.threadsScreen;
    aliases["features/chat/pages/Threads"] = stubs.threadsScreen;
  }
  if (useExpoMeetingsStub()) {
    aliases["features/meeting/pages/Meetings.tsx"] = stubs.meetingsScreen;
    aliases["features/meeting/pages/Meetings"] = stubs.meetingsScreen;
  }
  if (useExpoTelephonyStub()) {
    aliases["features/calling/components/InCallScreen.tsx"] = stubs.inCallScreen;
    aliases["features/calling/components/InCallScreen"] = stubs.inCallScreen;
    aliases["core/softphone/SoftphoneProvider.tsx"] = stubs.softphone;
    aliases["core/softphone/SoftphoneProvider"] = stubs.softphone;
  }
}

/** Vendored src uses createMMKV (MMKV v4 API); Expo pins react-native-mmkv 2.x. */
function applyMeetingsAliases(aliases) {
  if (useExpoMeetingsStub()) return;
  applyDailyWebRtcAliases(aliases);
}

function applyMmkvCompatAlias(aliases) {
  aliases["react-native-mmkv"] = path.join(shimsDir, "mmkv.shim.ts");
}

/** Single bundle identity for SoftphoneContext + useSoftphone (expo-shell bridge). */
function applyExpoSoftphoneAliases(aliases) {
  const softphoneContext = path.join(
    projectRoot,
    "expo-shell/voxoSoftphoneContext.ts"
  );
  if (fs.existsSync(softphoneContext)) {
    aliases["core/softphone/SoftphoneContext.ts"] = softphoneContext;
    aliases["core/softphone/SoftphoneContext"] = softphoneContext;
  }
  const useSoftphone = path.join(projectRoot, "expo-shell/useSoftphone.ts");
  if (fs.existsSync(useSoftphone)) {
    aliases["core/softphone/useSoftphone.ts"] = useSoftphone;
    aliases["core/softphone/useSoftphone"] = useSoftphone;
  }
}

function getBabelAliases() {
  const aliases = {};
  const stubs = getMetroStubPaths();

  applyExpoSoftphoneAliases(aliases);
  applyMmkvCompatAlias(aliases);
  applyGiphyAlias(aliases);
  applyNotificationAliases(aliases, stubs);
  applyTelephonyAliases(aliases);
  applyMeetingsAliases(aliases);

  addScreenStubs(aliases, stubs);

  if (useExpoUnlinkedNativeStubs()) {
    applyUnlinkedNativeAliases(aliases);
  }

  return aliases;
}

function getMetroStubPaths() {
  const stubsDir = path.resolve(__dirname, "stubs");
  return {
    notification: path.join(stubsDir, "NotificationManager.stub.ts"),
    notifee: path.join(stubsDir, "notifee.stub.ts"),
    useNotifications: path.join(stubsDir, "use-notifications.stub.ts"),
    sendbird: path.join(stubsDir, "SendbirdContextProvider.stub.tsx"),
    chatScreen: path.join(stubsDir, "ChatScreen.stub.tsx"),
    threadsScreen: path.join(stubsDir, "ThreadsScreen.stub.tsx"),
    meetingsScreen: path.join(stubsDir, "MeetingsScreen.stub.tsx"),
    inCallScreen: path.join(stubsDir, "InCallScreen.stub.tsx"),
    softphone: path.join(stubsDir, "SoftphoneProvider.stub.tsx"),
    firebaseMessaging: getFirebaseMessagingStubPath()
  };
}

function resolvePlatformShim(baseName, platform) {
  const androidPath = path.join(shimsDir, `${baseName}.android.ts`);
  const iosPath = path.join(shimsDir, `${baseName}.ios.ts`);
  const defaultPath = path.join(shimsDir, `${baseName}.ts`);
  if (platform === "android" && fs.existsSync(androidPath)) return androidPath;
  if (platform === "ios" && fs.existsSync(iosPath)) return iosPath;
  if (fs.existsSync(defaultPath)) return defaultPath;
  if (fs.existsSync(androidPath)) return androidPath;
  return null;
}

/** Metro resolveRequest: map shared-src screen imports to stubs when flags are off. */
function resolveDailyWebRtcMetro(moduleName) {
  if (moduleName === "@daily-co/react-native-webrtc") {
    return getWebrtcModuleEntry();
  }
  if (
    moduleName === "@daily-co/react-native-webrtc/lib/typescript/RTCTrackEvent"
  ) {
    return getWebrtcTrackEventAlias();
  }
  if (moduleName === "@daily-co/react-native-daily-js") {
    return path.join(
      projectRoot,
      "node_modules/@daily-co/react-native-daily-js/lib/commonjs/index.js"
    );
  }
  return null;
}

function resolveMetroStub(moduleName, stubs, platform) {
  if (moduleName === "react-native-mmkv") {
    return path.join(shimsDir, "mmkv.shim.ts");
  }
  if (moduleName === "@giphy/react-native-sdk") {
    return path.join(shimsDir, "giphy.shim.ts");
  }
  if (!useExpoMeetingsStub()) {
    const daily = resolveDailyWebRtcMetro(moduleName);
    if (daily) return daily;
  }
  if (useExpoNativeStubs()) {
    if (moduleName === "@react-native-firebase/messaging") {
      return stubs.firebaseMessaging;
    }
    if (
      moduleName.endsWith("core/notifications/NotificationManager") ||
      moduleName.endsWith("core/notifications/NotificationManager.ts")
    ) {
      return stubs.notification;
    }
    if (
      moduleName.endsWith("hooks/use-notifications") ||
      moduleName.endsWith("hooks/use-notifications.ts")
    ) {
      return stubs.useNotifications;
    }
    if (moduleName === "@notifee/react-native") {
      return stubs.notifee;
    }
  } else {
    if (moduleName === "@notifee/react-native") {
      return path.join(shimsDir, "notifee.shim.ts");
    }
    if (moduleName === "@react-native-firebase/messaging") {
      return path.join(shimsDir, "firebase-messaging.shim.ts");
    }
    if (moduleName === "@notifee/react-native-real") {
      return path.join(projectRoot, "node_modules/@notifee/react-native");
    }
    if (moduleName === "@react-native-firebase/messaging-real") {
      return path.join(projectRoot, "node_modules/@react-native-firebase/messaging");
    }
    if (moduleName === "react-native-callkeep") {
      return path.join(shimsDir, "callkeep.shim.ts");
    }
    if (moduleName === "react-native-callkeep-real") {
      return path.join(projectRoot, "node_modules/react-native-callkeep");
    }
    if (moduleName === "react-native-voip-push-notification") {
      return (
        resolvePlatformShim("voip-push.shim", platform) ??
        path.join(shimsDir, "voip-push.shim.android.ts")
      );
    }
    if (moduleName === "react-native-voip-push-notification-real") {
      return path.join(
        projectRoot,
        "node_modules/react-native-voip-push-notification"
      );
    }
    if (moduleName === "@react-native-community/push-notification-ios") {
      return (
        resolvePlatformShim("push-notification-ios.shim", platform) ??
        path.join(shimsDir, "push-notification-ios.shim.android.ts")
      );
    }
    if (moduleName === "@react-native-community/push-notification-ios-real") {
      return path.join(
        projectRoot,
        "node_modules/@react-native-community/push-notification-ios"
      );
    }
    if (moduleName === "react-native-incall-manager") {
      return path.join(shimsDir, "incall-manager.shim.ts");
    }
    if (moduleName === "react-native-incall-manager-real") {
      return path.join(projectRoot, "node_modules/react-native-incall-manager");
    }
  }
  if (useExpoChatStub()) {
    if (
      moduleName.endsWith("features/chat/utils/SendbirdContextProvider") ||
      moduleName.endsWith("features/chat/utils/SendbirdContextProvider.tsx")
    ) {
      return stubs.sendbird;
    }
    if (
      moduleName.endsWith("features/chat/pages/Chat") ||
      moduleName.endsWith("features/chat/pages/Chat.tsx")
    ) {
      return stubs.chatScreen;
    }
    if (
      moduleName.endsWith("features/chat/pages/Threads") ||
      moduleName.endsWith("features/chat/pages/Threads.tsx")
    ) {
      return stubs.threadsScreen;
    }
  }
  if (useExpoMeetingsStub()) {
    if (
      moduleName.endsWith("features/meeting/pages/Meetings") ||
      moduleName.endsWith("features/meeting/pages/Meetings.tsx")
    ) {
      return stubs.meetingsScreen;
    }
  }
  if (useExpoTelephonyStub()) {
    if (
      moduleName.endsWith("features/calling/components/InCallScreen") ||
      moduleName.endsWith("features/calling/components/InCallScreen.tsx")
    ) {
      return stubs.inCallScreen;
    }
    if (
      moduleName.endsWith("core/softphone/SoftphoneProvider") ||
      moduleName.endsWith("core/softphone/SoftphoneProvider.tsx")
    ) {
      return stubs.softphone;
    }
  }
  if (useExpoUnlinkedNativeStubs()) {
    const unlinked = resolveUnlinkedNativeStub(moduleName);
    if (unlinked) return unlinked;
  }
  return null;
}

module.exports = {
  useExpoNativeStubs,
  useExpoTelephonyStub,
  useExpoMeetingsStub,
  useExpoChatStub,
  useExpoUnlinkedNativeStubs,
  applyMmkvCompatAlias,
  getNativeRealAliases,
  getBabelAliases,
  getMetroStubPaths,
  resolveMetroStub
};
