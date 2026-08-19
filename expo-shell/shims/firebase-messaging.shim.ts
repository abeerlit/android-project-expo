/**
 * Use real FCM when linked; otherwise permission/token stub (react-native-permissions).
 */
import { NativeModules, Platform } from "react-native";

const hasNative =
  Platform.OS !== "web" && NativeModules.RNFBMessagingModule != null;

let messaging: () => unknown;

if (hasNative) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  messaging = require("@react-native-firebase/messaging-real").default;
} else {
  if (__DEV__) {
    console.warn(
      "[expo-shell] Firebase Messaging native module missing — using JS stub. Rebuild the iOS dev client in Xcode."
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  messaging = require("../stubs/firebase-messaging.stub.ts").default;
}

export default messaging;
