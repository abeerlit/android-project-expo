const { withAndroidManifest } = require("@expo/config-plugins");

function hasEntry(list, name) {
  return (list || []).some((e) => e.$?.["android:name"] === name);
}

function withCallKeepAndroid(config, options = {}) {
  if (options.enableTelephony !== true) {
    return config;
  }

  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (!app) return cfg;

    app.service = app.service || [];
    app.activity = app.activity || [];
    app.receiver = app.receiver || [];

    if (!hasEntry(app.service, "io.wazo.callkeep.VoiceConnectionService")) {
      app.service.push({
        $: {
          "android:name": "io.wazo.callkeep.VoiceConnectionService",
          "android:label": "@string/app_name",
          "android:permission": "android.permission.BIND_TELECOM_CONNECTION_SERVICE",
          "android:foregroundServiceType": "phoneCall|microphone",
          "android:exported": "true"
        },
        "intent-filter": [
          {
            action: [{ $: { "android:name": "android.telecom.ConnectionService" } }]
          }
        ]
      });
    }

    if (!hasEntry(app.service, "io.wazo.callkeep.RNCallKeepBackgroundMessagingService")) {
      app.service.push({
        $: {
          "android:name": "io.wazo.callkeep.RNCallKeepBackgroundMessagingService"
        }
      });
    }

    const activities = [
      {
        "android:name":
          "co.voxo.android.notifications.activities.IncomingCallFullScreenActivity",
        "android:launchMode": "singleTask",
        "android:excludeFromRecents": "true",
        "android:noHistory": "true",
        "android:showOnLockScreen": "true",
        "android:configChanges": "orientation",
        "android:screenOrientation": "portrait",
        "android:theme": "@style/AppTheme.Fullscreen",
        "android:exported": "true"
      },
      {
        "android:name":
          "co.voxo.android.notifications.activities.AnswerTrampolineActivity",
        "android:launchMode": "singleTask",
        "android:excludeFromRecents": "true",
        "android:noHistory": "true",
        "android:taskAffinity": "",
        "android:theme": "@style/AppTheme.Transparent",
        "android:exported": "true"
      }
    ];
    for (const attrs of activities) {
      if (!hasEntry(app.activity, attrs["android:name"])) {
        app.activity.push({ $: attrs });
      }
    }

    const receivers = [
      "co.voxo.android.notifications.VoxoConnectIncomingCallBroadcastReceiver",
      "co.voxo.android.EmptyNotificationCancelReceiver"
    ];
    for (const name of receivers) {
      if (!hasEntry(app.receiver, name)) {
        const entry = {
          $: {
            "android:name": name,
            "android:exported": "true"
          }
        };
        if (name.includes("EmptyNotification")) {
          entry.$["android:permission"] = "com.google.android.c2dm.permission.SEND";
          entry["intent-filter"] = [
            {
              $: { "android:priority": "-1" },
              action: [{ $: { "android:name": "com.google.android.c2dm.intent.RECEIVE" } }]
            }
          ];
        }
        app.receiver.push(entry);
      }
    }

    return cfg;
  });
}

module.exports = { withCallKeepAndroid };
