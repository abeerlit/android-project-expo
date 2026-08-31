#!/usr/bin/env node
/**
 * Move Android share targets off MainActivity onto ShareReceiverActivity.
 * Prevents Sharesheet from booting React inside the sharer's task.
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

const SHARE_ACTIVITY = `    <activity android:name=".ShareReceiverActivity" android:exported="true" android:theme="@android:style/Theme.Translucent.NoTitleBar" android:excludeFromRecents="true" android:noHistory="true" android:taskAffinity="">
      <intent-filter>
        <action android:name="android.intent.action.SEND"/>
        <data android:mimeType="image/*"/>
        <data android:mimeType="video/*"/>
        <category android:name="android.intent.category.DEFAULT"/>
      </intent-filter>
      <intent-filter>
        <action android:name="android.intent.action.SEND_MULTIPLE"/>
        <data android:mimeType="image/*"/>
        <data android:mimeType="video/*"/>
        <category android:name="android.intent.category.DEFAULT"/>
      </intent-filter>
    </activity>
`;

function stripSendFiltersFromMainActivity(xml) {
  // Remove SEND / SEND_MULTIPLE intent-filters that live under MainActivity.
  return xml.replace(
    /(<activity[^>]*android:name="\.MainActivity"[^>]*>)([\s\S]*?)(<\/activity>)/,
    (full, open, body, close) => {
      const cleaned = body.replace(
        /\s*<intent-filter>\s*<action android:name="android\.intent\.action\.SEND(?:_MULTIPLE)?"\/>[\s\S]*?<\/intent-filter>/g,
        "\n"
      );
      return `${open}${cleaned}${close}`;
    }
  );
}

function patchAndroidShareReceiver() {
  if (!fs.existsSync(MANIFEST)) {
    console.warn("[patch-share-receiver] skip — no AndroidManifest.xml");
    return false;
  }

  let xml = fs.readFileSync(MANIFEST, "utf8");
  const before = xml;
  xml = stripSendFiltersFromMainActivity(xml);

  if (!xml.includes('android:name=".ShareReceiverActivity"')) {
    xml = xml.replace(
      /(<activity android:name="\.MainActivity"[\s\S]*?<\/activity>\n)/,
      `$1${SHARE_ACTIVITY}`
    );
  }

  if (xml === before) {
    console.log("[patch-share-receiver] already applied");
    return true;
  }

  fs.writeFileSync(MANIFEST, xml);
  console.log(
    "[patch-share-receiver] ShareReceiverActivity owns SEND filters; removed from MainActivity"
  );
  return true;
}

module.exports = { patchAndroidShareReceiver };

if (require.main === module) {
  patchAndroidShareReceiver();
}
