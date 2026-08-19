const { withAppAuthScheme } = require("./withAppAuthScheme.js");
const { withOAuthRedirectFix } = require("./withOAuthRedirectFix.js");
const { withAndroidPermissions } = require("./withAndroidPermissions.js");
const { withCallKeepAndroid } = require("./withCallKeepAndroid.js");
const { withFirebaseAndroid } = require("./withFirebaseAndroid.js");
const { withMainApplicationPatch } = require("./withMainApplicationPatch.js");
const { withVoxoNativeAndroid } = require("./withVoxoNativeAndroid.js");

function withVoxoAndroid(config, options = {}) {
  const telephony = options.enableTelephony === true;
  const meetings = options.enableMeetings === true;
  const notifications =
    options.enableNotifications === true || telephony;
  const nativeCopy = options.enableNativeCopy === true;

  const packageName =
    options.packageName ?? process.env.ANDROID_PACKAGE ?? "co.voxo.android";

  config = withAppAuthScheme(config, { packageName });
  config = withOAuthRedirectFix(config, { packageName });
  config = withFirebaseAndroid(config, options);
  config = withAndroidPermissions(config, {
    ...options,
    enableTelephony: telephony,
    enableNotifications: notifications,
    enableMeetings: meetings
  });
  config = withCallKeepAndroid(config, { enableTelephony: telephony });
  if (nativeCopy) {
    config = withVoxoNativeAndroid(config);
    config = withMainApplicationPatch(config, {
      enableTelephony: telephony,
      enableNotifications: notifications
    });
  }
  return config;
}

module.exports = withVoxoAndroid;
