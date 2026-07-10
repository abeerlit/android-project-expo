import { NativeModules } from "react-native";

const hasNative = NativeModules.RNCPushNotificationIOS != null;

if (hasNative) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  module.exports = require("@react-native-community/push-notification-ios-real");
} else if (__DEV__) {
  console.warn(
    "[expo-shell] RNCPushNotificationIOS native module missing — using JS stub. Rebuild the iOS dev client in Xcode."
  );
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  module.exports = require("../stubs/push-notification-ios.stub.ts");
} else {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  module.exports = require("../stubs/push-notification-ios.stub.ts");
}
