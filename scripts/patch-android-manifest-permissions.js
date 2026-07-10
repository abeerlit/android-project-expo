#!/usr/bin/env node
/**
 * Ensure Expo / react-native-permissions manifest entries exist after prebuild.
 */
const fs = require("fs");
const path = require("path");

const MANIFEST = path.join(
  __dirname,
  "..",
  "android",
  "app",
  "src",
  "main",
  "AndroidManifest.xml"
);

const REQUIRED = [
  "android.permission.CAMERA",
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.ACCESS_COARSE_LOCATION",
  "android.permission.READ_MEDIA_IMAGES",
  "android.permission.READ_MEDIA_VIDEO",
  "android.permission.READ_MEDIA_AUDIO"
];

function patchAndroidManifestPermissions() {
  if (!fs.existsSync(MANIFEST)) {
    console.warn("[patch-manifest-perms] skip — no AndroidManifest.xml");
    return false;
  }
  let body = fs.readFileSync(MANIFEST, "utf8");
  let added = 0;
  for (const perm of REQUIRED) {
    if (body.includes(perm)) continue;
    body = body.replace(
      /<manifest[^>]*>/,
      (match) => `${match}\n  <uses-permission android:name="${perm}"/>`
    );
    added++;
  }
  if (added > 0) {
    fs.writeFileSync(MANIFEST, body);
    console.log(
      `[patch-manifest-perms] added ${added} uses-permission entries to AndroidManifest.xml`
    );
  } else {
    console.log("[patch-manifest-perms] all required permissions already present");
  }
  return true;
}

module.exports = { patchAndroidManifestPermissions };

if (require.main === module) {
  patchAndroidManifestPermissions();
}
