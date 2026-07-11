#!/usr/bin/env node
/**
 * EAS Android: load env flags, refresh autolinking metadata, apply native patches.
 * Ensures gated modules (Giphy, CallKeep, …) register in PackageList for production.
 */
const path = require("path");
const { loadEnv, isTruthy } = require("./load-env");

async function verifyAutolinking() {
  const root = path.join(__dirname, "..");
  const { createReactNativeConfigAsync } = require(
    "expo-modules-autolinking/build/reactNativeConfig/reactNativeConfig"
  );
  const result = await createReactNativeConfigAsync({
    platform: "android",
    projectRoot: root,
    searchPaths: [path.join(root, "node_modules")]
  });
  const names = Object.keys(result.dependencies ?? {});
  const chat = isTruthy("EXPO_PUBLIC_CHAT_NATIVE");
  const hasGiphy = names.includes("@giphy/react-native-sdk");
  console.log(
    `[eas-pre-install] autolinking deps=${names.length} chat=${chat} giphy=${hasGiphy}`
  );
  if (chat && !hasGiphy) {
    throw new Error(
      "EXPO_PUBLIC_CHAT_NATIVE is enabled but @giphy/react-native-sdk is not autolinked. " +
        "Check react-native.config.js / eas.json env."
    );
  }
}

async function main() {
  loadEnv();
  console.log(
    "[eas-pre-install] EXPO_PUBLIC_CHAT_NATIVE=",
    process.env.EXPO_PUBLIC_CHAT_NATIVE ?? "(unset)"
  );

  try {
    require("./refresh-android-autolinking.js").refreshAndroidAutolinking();
  } catch (e) {
    console.warn("[eas-pre-install] refresh autolinking:", e.message);
  }

  await verifyAutolinking();

  if (require("fs").existsSync(path.join(__dirname, "..", "android", "app"))) {
    require("./android-native-postbuild.js").runPostPrebuildFixes();
    try {
      require("./patch-android-gated-react-packages.js").patchAndroidGatedReactPackages();
    } catch (e) {
      console.warn("[eas-pre-install] gated react packages:", e.message);
    }
  }
}

main().catch((e) => {
  console.error("[eas-pre-install]", e);
  process.exit(1);
});
