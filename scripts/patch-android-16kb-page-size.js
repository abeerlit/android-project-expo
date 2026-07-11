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

const JNI_LIBS_BLOCK = `        jniLibs {
            excludes += ["**/armeabi/**"]
            useLegacyPackaging = false
        }`;

function repairPackagingBlock(body) {
  // packaging { jniLibs { ... } androidResources — missing packaging close brace
  body = body.replace(
    /packaging\s*\{\s*jniLibs\s*\{[\s\S]*?\n\s*\}\s*\n(\s*)androidResources/g,
    `packaging {\n${JNI_LIBS_BLOCK}\n    }\n$1androidResources`
  );

  // packaging { jniLibs { ... } } } androidResources — extra close brace
  body = body.replace(
    /packaging\s*\{\s*jniLibs\s*\{[\s\S]*?\n\s*\}\s*\n\s*\}\s*\n\s*\}\s*\n(\s*)androidResources/g,
    `packaging {\n${JNI_LIBS_BLOCK}\n    }\n$1androidResources`
  );

  return body;
}

function patchJniLibsInPackaging(body) {
  if (!body.includes("packaging {") || !body.includes("jniLibs {")) {
    return body;
  }

  if (
    body.includes('excludes += ["**/armeabi/**"]') &&
    body.includes("useLegacyPackaging = false")
  ) {
    return repairPackagingBlock(body);
  }

  if (body.includes("useLegacyPackaging")) {
    body = body.replace(
      /useLegacyPackaging[^\n]*/,
      "useLegacyPackaging = false"
    );
  } else {
    body = body.replace(
      /(packaging\s*\{\s*jniLibs\s*\{)/,
      `$1\n            excludes += ["**/armeabi/**"]\n            useLegacyPackaging = false`
    );
  }

  if (!body.includes('excludes += ["**/armeabi/**"]')) {
    body = body.replace(
      /(packaging\s*\{\s*jniLibs\s*\{)/,
      `$1\n            excludes += ["**/armeabi/**"]`
    );
  }

  return repairPackagingBlock(body);
}

function insertPackagingBeforeAndroidResources(body) {
  return body.replace(
    /(\n\s*)androidResources\s*\{/,
    `$1packaging {\n${JNI_LIBS_BLOCK}\n    }\n$1androidResources {`
  );
}

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

  if (!body.includes('abiFilters "armeabi-v7a", "arm64-v8a"')) {
    body = body.replace(
      /(versionName\s+"[^"]+"\s*\n)/,
      `$1        ndk {\n            abiFilters "armeabi-v7a", "arm64-v8a"\n        }\n`
    );
  }

  if (body.includes("packaging {")) {
    body = patchJniLibsInPackaging(body);
  } else if (body.includes("packagingOptions {")) {
    body = body.replace(
      /packagingOptions\s*\{[\s\S]*?\}/,
      `packaging {\n${JNI_LIBS_BLOCK}\n    }`
    );
    body = repairPackagingBlock(body);
  } else if (body.includes("androidResources {")) {
    body = insertPackagingBeforeAndroidResources(body);
  } else {
    body = body.replace(
      /(buildTypes\s*\{[\s\S]*?\n    \})/,
      `$1
    packaging {
${JNI_LIBS_BLOCK}
    }`
    );
  }

  body = repairPackagingBlock(body);
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
