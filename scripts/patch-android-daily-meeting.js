#!/usr/bin/env node
/**
 * Ensure Daily meeting foreground service + mediaProjection type (screen share on Android 14+).
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

const DAILY_SERVICE = "com.daily.reactlibrary.DailyOngoingMeetingForegroundService";
// Match bare + Daily README — do NOT add mediaProjection here (crashes on join on API 34+).
// Screen share uses MediaProjection separately when the user starts sharing.
const FGS_TYPE = "camera|microphone";

function patchAndroidDailyMeeting() {
  if (!fs.existsSync(MANIFEST)) {
    console.warn("[patch-daily-meeting] skip — no AndroidManifest.xml");
    return false;
  }

  let body = fs.readFileSync(MANIFEST, "utf8");
  let changed = false;

  if (!body.includes(DAILY_SERVICE)) {
    const insert = `
      <service
        android:name="${DAILY_SERVICE}"
        android:foregroundServiceType="${FGS_TYPE}"
        android:exported="false" />
`;
    body = body.replace(/<\/application>/, `${insert}\n    </application>`);
    changed = true;
    console.log("[patch-daily-meeting] added DailyOngoingMeetingForegroundService");
  } else if (!body.includes(`foregroundServiceType="${FGS_TYPE}"`)) {
    body = body.replace(
      new RegExp(
        `(<service[^>]*android:name="${DAILY_SERVICE.replace(/\./g, "\\.")}"[^>]*android:foregroundServiceType=")[^"]*(")`,
        "m"
      ),
      `$1${FGS_TYPE}$2`
    );
    if (!body.includes(`foregroundServiceType="${FGS_TYPE}"`)) {
      body = body.replace(
        `android:name="${DAILY_SERVICE}"`,
        `android:name="${DAILY_SERVICE}"\n        android:foregroundServiceType="${FGS_TYPE}"`
      );
    }
    changed = true;
    console.log("[patch-daily-meeting] updated Daily foregroundServiceType for screen share");
  }

  const mediaProjectionPerm = "android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION";
  if (!body.includes(mediaProjectionPerm)) {
    body = body.replace(
      /<manifest[^>]*>/,
      (m) => `${m}\n  <uses-permission android:name="${mediaProjectionPerm}"/>`
    );
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(MANIFEST, body);
  } else {
    console.log("[patch-daily-meeting] Daily meeting manifest already configured");
  }
  return true;
}

module.exports = { patchAndroidDailyMeeting };

if (require.main === module) {
  patchAndroidDailyMeeting();
}
