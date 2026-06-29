const {
  withAndroidManifest,
  AndroidConfig
} = require("@expo/config-plugins");

const { addPermission } = AndroidConfig.Permissions;
const { ensureToolsAvailable } = AndroidConfig.Manifest;

/** Must match app.config.ts react-native-permissions plugin + telephony extras. */
const PERMISSIONS = [
  "android.permission.CAMERA",
  "android.permission.RECORD_AUDIO",
  "android.permission.READ_CONTACTS",
  "android.permission.WRITE_CONTACTS",
  "android.permission.READ_PHONE_STATE",
  "android.permission.CALL_PHONE",
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.ACCESS_COARSE_LOCATION",
  "android.permission.READ_MEDIA_IMAGES",
  "android.permission.READ_MEDIA_VIDEO",
  "android.permission.READ_MEDIA_AUDIO",
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

function withAndroidManifestExtras(config, options = {}) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    ensureToolsAvailable(manifest);
    for (const perm of PERMISSIONS) {
      addPermission(manifest, perm);
    }
    if (
      options.enableTelephony === true ||
      options.enableNotifications === true ||
      options.enableMeetings === true
    ) {
      addManifestServices(manifest, options);
    }
    return cfg;
  });
}

function addManifestServices(manifest, options = {}) {
  const app = manifest.manifest.application?.[0];
  if (!app) return;
  app.service = app.service || [];
  app.activity = app.activity || [];
  app.receiver = app.receiver || [];

  const has = (name) =>
    (app.service || []).some((s) => s.$?.["android:name"] === name);

  if (!has("co.voxo.android.VoxoConnectFirebaseService")) {
    app.service.push({
      $: {
        "android:name": "co.voxo.android.VoxoConnectFirebaseService",
        "android:exported": "false"
      },
      "intent-filter": [
        {
          $: { "android:priority": "999" },
          action: [{ $: { "android:name": "com.google.firebase.MESSAGING_EVENT" } }]
        }
      ]
    });
  }

  if (
    options.enableTelephony === true &&
    !has("co.voxo.android.headlessTasks.HandleSipCallHeadlessTask")
  ) {
    app.service.push({
      $: {
        "android:name": "co.voxo.android.headlessTasks.HandleSipCallHeadlessTask",
        "android:foregroundServiceType": "phoneCall|microphone"
      }
    });
  }

  if (
    (options.enableTelephony === true || options.enableMeetings === true) &&
    !has("com.daily.reactlibrary.DailyOngoingMeetingForegroundService")
  ) {
    app.service.push({
      $: {
        "android:name": "com.daily.reactlibrary.DailyOngoingMeetingForegroundService",
        "android:foregroundServiceType": "camera|microphone",
        "android:exported": "false"
      }
    });
  }
}

module.exports = { withAndroidManifestExtras };
