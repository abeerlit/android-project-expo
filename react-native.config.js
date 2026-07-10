/**
 * Gate heavy native modules until EXPO_PUBLIC_* flags are enabled.
 */
const path = require("path");
const fs = require("fs");

const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const telephony =
  process.env.EXPO_PUBLIC_NATIVE_TELEPHONY === "1" ||
  process.env.EXPO_PUBLIC_NATIVE_TELEPHONY === "true";

const notifications =
  process.env.EXPO_PUBLIC_NATIVE_NOTIFICATIONS === "1" ||
  process.env.EXPO_PUBLIC_NATIVE_NOTIFICATIONS === "true" ||
  telephony;

const meetings =
  process.env.EXPO_PUBLIC_MEETINGS_NATIVE === "1" ||
  process.env.EXPO_PUBLIC_MEETINGS_NATIVE === "true" ||
  telephony;

const chat =
  process.env.EXPO_PUBLIC_CHAT_NATIVE === "1" ||
  process.env.EXPO_PUBLIC_CHAT_NATIVE === "true";

function off() {
  return { platforms: { ios: null, android: null } };
}

const deps = {};

if (!telephony) {
  Object.assign(deps, {
    "react-native-callkeep": off(),
    "react-native-voip-push-notification": off(),
    "react-native-incall-manager": off()
  });
}

if (!telephony && !meetings) {
  deps["react-native-background-timer"] = off();
}

if (!notifications) {
  Object.assign(deps, {
    "@react-native-firebase/messaging": off(),
    "@notifee/react-native": off(),
    "react-native-push-notification": off()
  });
}

if (!meetings) {
  Object.assign(deps, {
    "@daily-co/react-native-daily-js": off(),
    "@daily-co/react-native-webrtc": off()
  });
}

if (!chat) {
  Object.assign(deps, {
    "@giphy/react-native-sdk": off(),
    "@10play/tentap-editor": off()
  });
}

deps["@sentry/react-native"] = off();

module.exports = { dependencies: deps };
