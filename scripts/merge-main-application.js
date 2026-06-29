#!/usr/bin/env node
/**
 * Merge bare MainApplication telephony/notifications init into Expo-generated MainApplication.kt.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const BARE_MAIN = path.join(ROOT, "native-android", "reference", "MainApplication.kt");
const EXPO_MAIN = path.join(
  ROOT,
  "android",
  "app",
  "src",
  "main",
  "java",
  "co",
  "voxo",
  "android",
  "MainApplication.kt"
);

const EXTRA_IMPORTS = `
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.content.IntentFilter
import android.graphics.Color
import android.graphics.drawable.Icon
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.telecom.PhoneAccount
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import android.telephony.TelephonyManager
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import co.voxo.android.clipboard.VoxoClipboardModulePackage
import co.voxo.android.calling.module.VoxoDtmfSidetoneModulePackage
import co.voxo.android.telecom.CallKeepBroadcastReceiver
import co.voxo.android.notifications.module.AndroidNotificationsModulePackage
import io.wazo.callkeep.Constants.ACTION_ANSWER_CALL
import io.wazo.callkeep.Constants.ACTION_END_CALL
import io.wazo.callkeep.Constants.ACTION_ON_CREATE_CONNECTION_FAILED
import io.wazo.callkeep.Constants.ACTION_ONGOING_CALL
import io.wazo.callkeep.Constants.ACTION_SHOW_INCOMING_CALL_UI
import io.wazo.callkeep.Constants.ACTION_ON_SILENCE_INCOMING_CALL
import io.wazo.callkeep.VoiceConnectionService
`.trim();

function extractBareBlock(bare, startMarker, endMarker) {
  const start = bare.indexOf(startMarker);
  if (start === -1) return "";
  const end = bare.indexOf(endMarker, start);
  if (end === -1) return bare.slice(start);
  return bare.slice(start, end);
}

function mergeMainApplication(options = {}) {
  const telephony = options.telephony !== false;
  const notifications = options.notifications !== false;
  if (!telephony && !notifications) return false;
  if (!fs.existsSync(EXPO_MAIN) || !fs.existsSync(BARE_MAIN)) {
    console.warn("[merge-main-application] skip — MainApplication.kt missing");
    return false;
  }

  const bare = fs.readFileSync(BARE_MAIN, "utf8");
  let body = fs.readFileSync(EXPO_MAIN, "utf8");

  if (!body.includes("AndroidNotificationsModulePackage")) {
    body = body.replace(
      /val packages = PackageList\(this\)\.packages[\s\S]*?return packages/,
      `val packages = PackageList(this).packages.apply {
              add(AndroidNotificationsModulePackage())
              add(VoxoDtmfSidetoneModulePackage())
              add(VoxoClipboardModulePackage())
            }
            return packages`
    );
    body = body.replace(
      "import com.facebook.react.PackageList",
      `${EXTRA_IMPORTS}\nimport com.facebook.react.PackageList`
    );
  }

  const channelsBlock = extractBareBlock(
    bare,
    "private fun createNotificationChannels()",
    "private fun initCallKeep()"
  );
  const callKeepBlock = extractBareBlock(bare, "private fun initCallKeep()", "private fun getApplicationName");
  const companionBlock = extractBareBlock(bare, "companion object {", "}\n}");

  if (notifications && channelsBlock && !body.includes("createNotificationChannels()")) {
    body = body.replace(
      "ApplicationLifecycleDispatcher.onApplicationCreate(this)",
      `createNotificationChannels()\n    ${telephony ? "initCallKeep()\n    " : ""}ApplicationLifecycleDispatcher.onApplicationCreate(this)`
    );
    body = body.replace(
      /}\n$/,
      `\n  ${channelsBlock}\n  ${telephony ? callKeepBlock + "\n" : ""}${bare.includes("private fun getApplicationName") ? extractBareBlock(bare, "private fun getApplicationName", "companion object") : ""}\n  ${companionBlock}\n}\n`
    );
  } else if (telephony && callKeepBlock && !body.includes("initCallKeep()")) {
    body = body.replace(
      "ApplicationLifecycleDispatcher.onApplicationCreate(this)",
      `initCallKeep()\n    ApplicationLifecycleDispatcher.onApplicationCreate(this)`
    );
    if (!body.includes("companion object")) {
      body = body.replace(/}\n$/, `\n  ${callKeepBlock}\n  ${companionBlock}\n}\n`);
    }
  }

  fs.writeFileSync(EXPO_MAIN, body);
  console.log("[merge-main-application] patched MainApplication.kt");
  return true;
}

module.exports = { mergeMainApplication };

if (require.main === module) {
  mergeMainApplication({
    telephony: process.env.EXPO_PUBLIC_NATIVE_TELEPHONY === "1",
    notifications:
      process.env.EXPO_PUBLIC_NATIVE_NOTIFICATIONS === "1" ||
      process.env.EXPO_PUBLIC_NATIVE_TELEPHONY === "1"
  });
}
