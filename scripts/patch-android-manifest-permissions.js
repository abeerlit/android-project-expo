#!/usr/bin/env node
/**
 * Deduplicate uses-permission entries and ensure required permissions exist.
 * Multiple plugins/scripts (expo prebuild, react-native-permissions, withVoxoAndroid)
 * were appending the same permissions on every postbuild.
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

/** Canonical set — matches plugins/withAndroidManifestExtras.js + Expo defaults. */
const REQUIRED = [
  "android.permission.INTERNET",
  "android.permission.VIBRATE",
  "android.permission.SYSTEM_ALERT_WINDOW",
  "android.permission.CAMERA",
  "android.permission.RECORD_AUDIO",
  "android.permission.READ_CONTACTS",
  "android.permission.WRITE_CONTACTS",
  "android.permission.CALL_PHONE",
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.ACCESS_COARSE_LOCATION",
  "android.permission.READ_MEDIA_IMAGES",
  "android.permission.READ_MEDIA_VIDEO",
  "android.permission.READ_MEDIA_AUDIO",
  "android.permission.READ_EXTERNAL_STORAGE",
  "android.permission.WRITE_EXTERNAL_STORAGE",
  "android.permission.MANAGE_OWN_CALLS",
  "android.permission.READ_PHONE_NUMBERS",
  "android.permission.MODIFY_AUDIO_SETTINGS",
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_PHONE_CALL",
  "android.permission.FOREGROUND_SERVICE_MICROPHONE",
  "android.permission.FOREGROUND_SERVICE_CAMERA",
  "android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION",
  "android.permission.FOREGROUND_SERVICE_REMOTE_MESSAGING",
  "android.permission.USE_FULL_SCREEN_INTENT",
  "android.permission.WAKE_LOCK",
  "android.permission.BIND_TELECOM_CONNECTION_SERVICE"
];

/** Prefer entries with tools:node / maxSdkVersion when deduping. */
const SPECIAL_PERMISSIONS = {
  "android.permission.READ_PHONE_STATE":
    '<uses-permission android:name="android.permission.READ_PHONE_STATE" android:maxSdkVersion="29" tools:node="replace"/>'
};

function scorePermissionLine(line) {
  let score = 0;
  if (line.includes("tools:")) score += 4;
  if (line.includes("maxSdkVersion")) score += 2;
  if (line.includes('tools:node="replace"')) score += 1;
  return score;
}

function parsePermissionName(line) {
  const match = line.match(/android:name="([^"]+)"/);
  return match ? match[1] : null;
}

function dedupeManifestPermissions(body) {
  const lines = body.split("\n");
  const manifestOpenIdx = lines.findIndex((l) => l.trim().startsWith("<manifest"));
  const queriesIdx = lines.findIndex((l) => l.trim().startsWith("<queries"));
  const applicationIdx = lines.findIndex((l) => l.trim().startsWith("<application"));

  const bodyStart = manifestOpenIdx >= 0 ? manifestOpenIdx + 1 : 0;
  const bodyEnd =
    queriesIdx >= 0
      ? queriesIdx
      : applicationIdx >= 0
        ? applicationIdx
        : lines.length;

  const before = lines.slice(0, bodyStart);
  const after = lines.slice(bodyEnd);

  const byName = new Map();
  for (let i = bodyStart; i < bodyEnd; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("<uses-permission")) continue;
    const name = parsePermissionName(line);
    if (!name) continue;
    const existing = byName.get(name);
    if (!existing || scorePermissionLine(line) > scorePermissionLine(existing)) {
      byName.set(name, line);
    }
  }

  for (const perm of REQUIRED) {
    if (!byName.has(perm)) {
      byName.set(
        perm,
        SPECIAL_PERMISSIONS[perm] ??
          `<uses-permission android:name="${perm}"/>`
      );
    }
  }

  if (!byName.has("android.permission.READ_PHONE_STATE")) {
    byName.set(
      "android.permission.READ_PHONE_STATE",
      SPECIAL_PERMISSIONS["android.permission.READ_PHONE_STATE"]
    );
  }

  const sorted = [...byName.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const permissionLines = sorted.map(([, line]) => `  ${line}`);

  return [...before, ...permissionLines, ...after].join("\n");
}

function patchAndroidManifestPermissions() {
  if (!fs.existsSync(MANIFEST)) {
    console.warn("[patch-manifest-perms] skip — no AndroidManifest.xml");
    return false;
  }

  const before = fs.readFileSync(MANIFEST, "utf8");
  const beforeCount = (before.match(/<uses-permission/g) || []).length;
  const after = dedupeManifestPermissions(before);
  const afterCount = (after.match(/<uses-permission/g) || []).length;

  if (after !== before) {
    fs.writeFileSync(MANIFEST, after);
    console.log(
      `[patch-manifest-perms] deduped permissions ${beforeCount} → ${afterCount}`
    );
  } else {
    console.log(`[patch-manifest-perms] permissions ok (${afterCount} entries)`);
  }
  return true;
}

module.exports = { patchAndroidManifestPermissions, dedupeManifestPermissions };

if (require.main === module) {
  patchAndroidManifestPermissions();
}
