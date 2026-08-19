#!/usr/bin/env node
/**
 * Add bare-android deps required by Voxo Kotlin (FCM service, incoming-call UI).
 */
const fs = require("fs");
const path = require("path");

const APP_BUILD = path.join(__dirname, "..", "android", "app", "build.gradle");

const VOXO_DEPS = [
  'implementation "androidx.core:core:1.15.0"',
  'implementation "androidx.core:core-ktx:1.15.0"',
  'implementation "androidx.appcompat:appcompat:1.7.1"',
  'implementation "androidx.constraintlayout:constraintlayout:2.1.4"',
  'implementation "androidx.recyclerview:recyclerview:1.3.2"',
  'implementation "androidx.localbroadcastmanager:localbroadcastmanager:1.1.0"',
  'implementation platform("com.google.firebase:firebase-bom:32.7.0")',
  'implementation "com.google.firebase:firebase-messaging-ktx"'
];

function patchAndroidAppDependencies() {
  if (!fs.existsSync(APP_BUILD)) {
    console.warn("[patch-android-deps] skip — no android/app/build.gradle");
    return false;
  }
  let body = fs.readFileSync(APP_BUILD, "utf8");
  const marker = "// voxo-native-deps";
  if (body.includes(marker)) {
    return true;
  }
  const lines = VOXO_DEPS.map((d) => `    ${d}`).join("\n");
  const block = `\n    ${marker}\n${lines}`;
  const anchor = 'implementation("com.facebook.react:react-android")';
  if (!body.includes(anchor)) {
    console.warn("[patch-android-deps] react-android anchor not found");
    return false;
  }
  body = body.replace(anchor, `${anchor}${block}`);
  fs.writeFileSync(APP_BUILD, body);
  console.log("[patch-android-deps] added Voxo native Android dependencies");
  return true;
}

const SUPPORT_EXCLUDES = `
// voxo-support-excludes — avoid duplicate classes with androidx (react-native-push-notification)
configurations.all {
    exclude group: "com.android.support", module: "support-compat"
    exclude group: "com.android.support", module: "support-v4"
    exclude group: "com.android.support", module: "appcompat-v7"
}
`;

function patchSupportExcludes() {
  if (!fs.existsSync(APP_BUILD)) return false;
  let body = fs.readFileSync(APP_BUILD, "utf8");
  if (body.includes("voxo-support-excludes")) return true;
  const anchor = "apply plugin: 'com.google.gms.google-services'";
  if (!body.includes(anchor)) {
    body += SUPPORT_EXCLUDES;
  } else {
    body = body.replace(anchor, `${SUPPORT_EXCLUDES}\n${anchor}`);
  }
  fs.writeFileSync(APP_BUILD, body);
  console.log("[patch-android-deps] excluded legacy com.android.support artifacts");
  return true;
}

module.exports = { patchAndroidAppDependencies, patchSupportExcludes };

if (require.main === module) {
  patchAndroidAppDependencies();
  patchSupportExcludes();
}
