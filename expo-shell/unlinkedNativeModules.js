const path = require("path");

function envOn(name) {
  const v = process.env[name];
  return v === "1" || v === "true";
}

/** JS-only or required for auth UX — always use the real package. */
const NEVER_STUB_MODULES = new Set([
  "react-native-confirmation-code-field"
]);

/** Use real RN package when native full build is enabled. */
const NATIVE_FULL_MODULES = new Set([
  "react-native-skeleton-placeholder",
  "react-native-image-picker"
]);

/** Linked when meetings are enabled (Daily UI + nav bar in meeting sheets). */
const MEETINGS_LINKED_NATIVE_MODULES = new Set([
  "react-native-system-navigation-bar"
]);

/** Linked in the Expo dev client when chat is enabled; do not Metro-stub. */
const CHAT_LINKED_NATIVE_MODULES = new Set([
  "react-native-document-picker",
  "react-native-image-crop-picker",
  "react-native-blob-util",
  "react-native-fs",
  "react-native-video",
  "react-native-image-modal",
  "@react-native-camera-roll/camera-roll",
  "@giphy/react-native-sdk"
]);

/** Inbox voicemail/recordings playback — linked in the dev client binary. */
const INBOX_LINKED_NATIVE_MODULES = new Set([
  "react-native-sound",
  "@react-native-community/slider"
]);

/** Metro/Babel stubs for RN packages not linked in the Expo dev client binary. */
const UNLINKED_NATIVE_MODULES = {
  "react-native-document-picker": "document-picker.stub.ts",
  "react-native-image-crop-picker": "image-crop-picker.stub.ts",
  "react-native-image-picker": "../shims/image-picker.shim.ts",
  "react-native-blob-util": "blob-util.stub.ts",
  "react-native-fs": "fs.stub.ts",
  "react-native-video": "video.stub.tsx",
  "react-native-image-modal": "image-modal.stub.tsx",
  "@react-native-camera-roll/camera-roll": "camera-roll.stub.ts",
  "react-native-push-notification": "push-notification.stub.ts",
  "react-native-email-link": "email-link.stub.ts",
  "react-native-skeleton-placeholder": "skeleton-placeholder.stub.tsx",
  "react-native-advanced-checkbox": "advanced-checkbox.stub.tsx",
  "react-native-system-navigation-bar": "system-navigation-bar.stub.ts",
  "@react-native-community/slider": "slider.stub.tsx",
  "@giphy/react-native-sdk": "giphy.stub.ts"
};

function getUnlinkedStubPath(moduleName) {
  const file = UNLINKED_NATIVE_MODULES[moduleName];
  if (!file) return null;
  return path.join(__dirname, "stubs", file);
}

function shouldStubUnlinkedModule(moduleName) {
  if (NEVER_STUB_MODULES.has(moduleName)) return false;
  if (envOn("EXPO_PUBLIC_NATIVE_FULL") && NATIVE_FULL_MODULES.has(moduleName)) {
    return false;
  }
  if (envOn("EXPO_PUBLIC_CHAT_NATIVE") && CHAT_LINKED_NATIVE_MODULES.has(moduleName)) {
    return false;
  }
  if (
    envOn("EXPO_PUBLIC_MEETINGS_NATIVE") &&
    MEETINGS_LINKED_NATIVE_MODULES.has(moduleName)
  ) {
    return false;
  }
  if (INBOX_LINKED_NATIVE_MODULES.has(moduleName)) {
    return false;
  }
  return true;
}

function applyUnlinkedNativeAliases(aliases) {
  for (const moduleName of Object.keys(UNLINKED_NATIVE_MODULES)) {
    if (!shouldStubUnlinkedModule(moduleName)) continue;
    const stubPath = getUnlinkedStubPath(moduleName);
    if (stubPath) aliases[moduleName] = stubPath;
  }
}

function resolveUnlinkedNativeStub(moduleName) {
  if (!shouldStubUnlinkedModule(moduleName)) return null;
  return getUnlinkedStubPath(moduleName);
}

module.exports = {
  UNLINKED_NATIVE_MODULES,
  NEVER_STUB_MODULES,
  NATIVE_FULL_MODULES,
  CHAT_LINKED_NATIVE_MODULES,
  MEETINGS_LINKED_NATIVE_MODULES,
  INBOX_LINKED_NATIVE_MODULES,
  shouldStubUnlinkedModule,
  applyUnlinkedNativeAliases,
  resolveUnlinkedNativeStub
};
