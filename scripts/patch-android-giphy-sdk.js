#!/usr/bin/env node
/**
 * Bump embedded Giphy Android SDK for 16 KB page size / Fresco compatibility.
 */
const fs = require("fs");
const path = require("path");

const GIPHY_BUILD_GRADLE = path.join(
  __dirname,
  "..",
  "node_modules",
  "@giphy",
  "react-native-sdk",
  "android",
  "build.gradle"
);

const TARGET_SDK = "2.4.1";
const MARKER = "// voxo-giphy-android-sdk";

function patchAndroidGiphySdk() {
  if (!fs.existsSync(GIPHY_BUILD_GRADLE)) {
    console.warn("[patch-giphy-sdk] skip — @giphy/react-native-sdk android/build.gradle missing");
    return false;
  }

  let body = fs.readFileSync(GIPHY_BUILD_GRADLE, "utf8");
  const dep = `implementation 'com.giphy.sdk:ui:${TARGET_SDK}'`;
  const replaced = body.replace(
    /implementation\s+['"]com\.giphy\.sdk:ui:[^'"]+['"]/,
    dep
  );
  if (replaced === body && body.includes(`com.giphy.sdk:ui:${TARGET_SDK}`)) {
    return true;
  }
  if (replaced === body) {
    console.warn("[patch-giphy-sdk] giphy ui dependency line not found");
    return false;
  }
  if (!body.includes(MARKER)) {
    body = replaced.replace(
      "dependencies {",
      `dependencies {\n  ${MARKER}`
    );
  } else {
    body = replaced;
  }
  fs.writeFileSync(GIPHY_BUILD_GRADLE, body);
  console.log(`[patch-giphy-sdk] set com.giphy.sdk:ui:${TARGET_SDK}`);
  return true;
}

module.exports = { patchAndroidGiphySdk };

if (require.main === module) {
  patchAndroidGiphySdk();
}
