#!/usr/bin/env node
/**
 * Gradle autolinking entrypoint — loads .env before react-native-config so
 * gated modules (CallKeep, Giphy, FCM, Daily, …) match EXPO_PUBLIC_* flags.
 */
const path = require("path");

require("./load-env").loadEnv();

require(
  require.resolve("expo-modules-autolinking", {
    paths: [require.resolve("expo/package.json")]
  })
)(process.argv.slice(2));
