import { NativeModules } from "react-native";

const hasNative = NativeModules.RNVoipPushNotificationManager != null;

if (hasNative) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  module.exports = require("react-native-voip-push-notification-real");
} else if (__DEV__) {
  console.warn(
    "[expo-shell] VoIP push native module missing — using JS stub. Rebuild the iOS dev client in Xcode."
  );
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  module.exports = require("../stubs/voip-push.stub.ts");
} else {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  module.exports = require("../stubs/voip-push.stub.ts");
}
