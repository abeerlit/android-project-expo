/**
 * Use real InCallManager when linked; otherwise no-op stub for dev client without native rebuild.
 */
import { NativeModules } from "react-native";

const hasNative =
  NativeModules.InCallManager != null || NativeModules.RNInCallManager != null;

if (hasNative) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  module.exports = require("react-native-incall-manager-real");
} else if (__DEV__) {
  console.warn(
    "[expo-shell] InCallManager native module missing — using JS stub. Rebuild the iOS dev client in Xcode."
  );
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  module.exports = require("../stubs/incall-manager.stub.ts");
} else {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  module.exports = require("../stubs/incall-manager.stub.ts");
}
