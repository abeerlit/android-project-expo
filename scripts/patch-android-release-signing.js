#!/usr/bin/env node
/**
 * Wire release builds to voxo.keystore (same upload key as android-project / Play Console).
 * Keystore is copied from ../android-project/android/app/voxo.keystore when missing.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const APP_DIR = path.join(ROOT, "android", "app");
const KEYSTORE = path.join(APP_DIR, "voxo.keystore");
const BARE_KEYSTORE = path.join(
  ROOT,
  "..",
  "android-project",
  "android",
  "app",
  "voxo.keystore"
);
const GRADLE_PROPS = path.join(ROOT, "android", "gradle.properties");
const APP_BUILD = path.join(APP_DIR, "build.gradle");
const MARKER = "# voxo-release-signing";

function ensureKeystore() {
  if (fs.existsSync(KEYSTORE)) return true;
  if (!fs.existsSync(BARE_KEYSTORE)) {
    console.warn(
      "[patch-release-signing] voxo.keystore missing — copy from android-project/android/app/"
    );
    return false;
  }
  fs.copyFileSync(BARE_KEYSTORE, KEYSTORE);
  console.log("[patch-release-signing] copied voxo.keystore from android-project");
  return true;
}

function patchGradleProperties() {
  if (!fs.existsSync(GRADLE_PROPS)) return false;
  let body = fs.readFileSync(GRADLE_PROPS, "utf8");
  if (body.includes(MARKER)) return true;

  body += `
${MARKER}
MYAPP_UPLOAD_STORE_FILE=voxo.keystore
MYAPP_UPLOAD_KEY_ALIAS=voxo-android
MYAPP_UPLOAD_STORE_PASSWORD=Password1!
MYAPP_UPLOAD_KEY_PASSWORD=Password1!
`;
  fs.writeFileSync(GRADLE_PROPS, body);
  console.log("[patch-release-signing] updated gradle.properties");
  return true;
}

function patchAppBuildGradle() {
  if (!fs.existsSync(APP_BUILD)) return false;
  let body = fs.readFileSync(APP_BUILD, "utf8");

  if (!body.includes("signingConfigs.release")) {
    body = body.replace(
      /(signingConfigs\s*\{\s*debug\s*\{[\s\S]*?\}\s*)\}/,
      `$1
        release {
            if (project.hasProperty('MYAPP_UPLOAD_STORE_FILE')) {
                storeFile file(MYAPP_UPLOAD_STORE_FILE)
                storePassword MYAPP_UPLOAD_STORE_PASSWORD
                keyAlias MYAPP_UPLOAD_KEY_ALIAS
                keyPassword MYAPP_UPLOAD_KEY_PASSWORD
            }
        }
    }`
    );
  }

  body = body.replace(
    /release\s*\{[^}]*signingConfig signingConfigs\.debug/,
    `release {
            signingConfig signingConfigs.release`
  );

  fs.writeFileSync(APP_BUILD, body);
  console.log("[patch-release-signing] updated app/build.gradle");
  return true;
}

function patchAndroidReleaseSigning() {
  if (!fs.existsSync(APP_DIR)) {
    console.warn("[patch-release-signing] skip — no android/app");
    return false;
  }
  ensureKeystore();
  patchGradleProperties();
  patchAppBuildGradle();
  return true;
}

module.exports = { patchAndroidReleaseSigning };

if (require.main === module) {
  patchAndroidReleaseSigning();
}
