import { NativeModules } from "react-native";

const hasNative = NativeModules.RNCallKeep != null;

if (hasNative) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  module.exports = require("react-native-callkeep-real");
} else if (__DEV__) {
  console.warn(
    "[expo-shell] RNCallKeep native module missing — using JS stub. Rebuild the iOS dev client in Xcode."
  );
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  module.exports = require("../stubs/callkeep.stub.ts");
} else {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  module.exports = require("../stubs/callkeep.stub.ts");
}
