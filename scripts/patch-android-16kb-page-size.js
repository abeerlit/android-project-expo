#!/usr/bin/env node
/**
 * Google Play 16 KB page size: ARM-only ABIs, NDK r28, uncompressed jni packaging.
 * Survives expo prebuild when run from android-native-postbuild.js.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const BUILD_GRADLE = path.join(ROOT, "android", "build.gradle");
const APP_BUILD = path.join(ROOT, "android", "app", "build.gradle");
const GRADLE_PROPS = path.join(ROOT, "android", "gradle.properties");

const NDK_VERSION = "28.0.13004108";
const KOTLIN_VERSION = "2.0.21";
const MARKER = "// voxo-16kb-page-size";

function removeLinphoneSdk() {
  let changed = false;

  if (fs.existsSync(BUILD_GRADLE)) {
    let body = fs.readFileSync(BUILD_GRADLE, "utf8");
    const next = body.replace(
      /\n\s*maven \{ url "https:\/\/download\.linphone\.org\/maven_repository\/" \}/g,
      ""
    );
    if (next !== body) {
      fs.writeFileSync(BUILD_GRADLE, next);
      changed = true;
      console.log("[patch-16kb] removed linphone maven repository");
    }
  }

  if (fs.existsSync(APP_BUILD)) {
    let body = fs.readFileSync(APP_BUILD, "utf8");
    const next = body.replace(
      /\n\s*implementation "org\.linphone:linphone-sdk-android:[^"]+"/g,
      ""
    );
    if (next !== body) {
      fs.writeFileSync(APP_BUILD, next);
      changed = true;
      console.log("[patch-16kb] removed linphone-sdk-android dependency");
    }
  }

  return changed;
}

function patchRootBuildGradle() {
  if (!fs.existsSync(BUILD_GRADLE)) return false;
  let body = fs.readFileSync(BUILD_GRADLE, "utf8");
  body = body.replace(
    /ndkVersion\s*=\s*"[^"]+"/,
    `ndkVersion = "${NDK_VERSION}"`
  );
  body = body.replace(
    /kotlinVersion = findProperty\('android.kotlinVersion'\) \?: '[^']+'/,
    `kotlinVersion = findProperty('android.kotlinVersion') ?: '${KOTLIN_VERSION}'`
  );
  if (!body.includes(MARKER)) {
    const hook = `
${MARKER}
subprojects { subproject ->
    subproject.plugins.withId("com.android.library") {
        subproject.android {
            if (namespace == null) {
                return
            }
            defaultConfig {
                externalNativeBuild {
                    cmake {
                        arguments "-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON"
                    }
                }
            }
        }
    }
    subproject.plugins.withId("com.android.application") {
        subproject.android {
            defaultConfig {
                externalNativeBuild {
                    cmake {
                        arguments "-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON"
                    }
                }
            }
        }
    }
}
`;
    body = body.replace(
      /apply plugin: "com.facebook.react.rootproject"/,
      `apply plugin: "com.facebook.react.rootproject"\n${hook}`
    );
  }
  fs.writeFileSync(BUILD_GRADLE, body);
  return true;
}

function patchAppBuildGradle() {
  if (!fs.existsSync(APP_BUILD)) return false;
  let body = fs.readFileSync(APP_BUILD, "utf8");

  // Repair a prior bad packaging { } regex replacement (stray brace before androidResources).
  body = body.replace(
    /(\n    packaging \{[\s\S]*?\n    \})\n    \}(\n    androidResources)/,
    "$1$2"
  );

  if (!body.includes('abiFilters "armeabi-v7a", "arm64-v8a"')) {
    body = body.replace(
      /(versionName\s+"[^"]+"\s*\n)/,
      `$1        ndk {\n            abiFilters "armeabi-v7a", "arm64-v8a"\n        }\n`
    );
  }

  if (!body.includes('excludes += ["**/armeabi/**"]')) {
    if (body.includes("jniLibs {")) {
      body = body.replace(/(jniLibs\s*\{)/, `$1\n            excludes += ["**/armeabi/**"]`);
    } else if (body.includes("packagingOptions {")) {
      body = body.replace(
        /(packagingOptions\s*\{)/,
        `$1
        jniLibs {
            excludes += ["**/armeabi/**"]
            useLegacyPackaging = false
        }`
      );
    } else {
      body = body.replace(
        /(\n    androidResources\s*\{)/,
        `
    packagingOptions {
        jniLibs {
            excludes += ["**/armeabi/**"]
            useLegacyPackaging = false
        }
    }$1`
      );
    }
  }

  body = body.replace(
    /useLegacyPackaging\s*=\s*false\s*\?:\s*false\)/g,
    "useLegacyPackaging = false"
  );
  body = body.replace(
    /useLegacyPackaging\s*\(findProperty\('expo\.useLegacyPackaging'\)\?\.toBoolean\(\)\s*\?:\s*false\)/g,
    "useLegacyPackaging = false"
  );
  body = body.replace(
    /useLegacyPackaging\s*\(findProperty\('expo\.useLegacyPackaging'\)\s*\?:\s*false\)/g,
    "useLegacyPackaging = false"
  );

  fs.writeFileSync(APP_BUILD, body);
  return true;
}

function patchGradleProperties() {
  if (!fs.existsSync(GRADLE_PROPS)) return false;
  let body = fs.readFileSync(GRADLE_PROPS, "utf8");
  if (body.includes("reactNativeArchitectures=armeabi-v7a,arm64-v8a")) {
    body = body.replace(
      /reactNativeArchitectures=.*/,
      "reactNativeArchitectures=armeabi-v7a,arm64-v8a"
    );
  } else {
    body += "\nreactNativeArchitectures=armeabi-v7a,arm64-v8a\n";
  }
  body = body.replace(/expo\.useLegacyPackaging=.*/g, "expo.useLegacyPackaging=false");
  body = body.replace(/android\.kotlinVersion=.*/g, `android.kotlinVersion=${KOTLIN_VERSION}`);
  if (!body.includes("android.kotlinVersion=")) {
    body += `\nandroid.kotlinVersion=${KOTLIN_VERSION}\n`;
  }
  if (!body.includes("expo.useLegacyPackaging=false")) {
    body += "\nexpo.useLegacyPackaging=false\n";
  }
  fs.writeFileSync(GRADLE_PROPS, body);
  return true;
}

function patchAndroid16kbPageSize() {
  if (!fs.existsSync(path.join(ROOT, "android", "app"))) {
    console.warn("[patch-16kb] skip — no android/ (run prebuild first)");
    return false;
  }
  removeLinphoneSdk();
  patchRootBuildGradle();
  patchAppBuildGradle();
  patchGradleProperties();
  console.log("[patch-16kb] applied 16 KB page size gradle settings");
  return true;
}

module.exports = { patchAndroid16kbPageSize, removeLinphoneSdk };

if (require.main === module) {
  patchAndroid16kbPageSize();
}
