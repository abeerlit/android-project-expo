const path = require("path");
const { loadEnv, isTruthy } = require("./load-env");
const { copyVoxoNativeAndroid } = require("./copy-voxo-native-android");

function runPostPrebuildFixes(options = {}) {
  const telephony =
    options.telephony ??
    (isTruthy("EXPO_PUBLIC_NATIVE_TELEPHONY") ||
      isTruthy("EXPO_PUBLIC_NATIVE_NOTIFICATIONS"));
  const meetingsNative = isTruthy("EXPO_PUBLIC_MEETINGS_NATIVE");

  const root = path.join(__dirname, "..");
  if (!require("fs").existsSync(path.join(root, "android", "app"))) {
    console.warn("[android-native-postbuild] skip — no android/ (run prebuild first)");
    return false;
  }

  try {
    const { execSync } = require("child_process");
    execSync("node scripts/refresh-android-autolinking.js", {
      cwd: root,
      stdio: "inherit"
    });
  } catch (e) {
    console.warn("[android-native-postbuild] refresh autolinking:", e.message);
  }

  require("./sync-google-services.js").syncGoogleServices();
  try {
    require("./patch-app-auth-scheme.js").patchAppAuthScheme();
  } catch (e) {
    console.warn("[android-native-postbuild] app auth scheme:", e.message);
  }
  try {
    require("./patch-android-oauth-manifest.js").patchAndroidOAuthManifest();
  } catch (e) {
    console.warn("[android-native-postbuild] oauth manifest:", e.message);
  }
  try {
    require("./patch-android-notifee-maven.js").patchAndroidNotifeeMaven();
  } catch (e) {
    console.warn("[android-native-postbuild] Notifee maven:", e.message);
  }
  try {
    require("./patch-android-manifest-permissions.js").patchAndroidManifestPermissions();
  } catch (e) {
    console.warn("[android-native-postbuild] manifest permissions:", e.message);
  }
  try {
    require("./patch-android-splash-theme.js").patchSplashTheme();
  } catch (e) {
    console.warn("[android-native-postbuild] splash theme patch:", e.message);
  }
  const chatNative = isTruthy("EXPO_PUBLIC_CHAT_NATIVE");
  if (chatNative) {
    try {
      require("./patch-android-clipboard.js").patchAndroidClipboard();
    } catch (e) {
      console.warn("[android-native-postbuild] clipboard patch:", e.message);
    }
  }

  if (telephony || isTruthy("EXPO_PUBLIC_NATIVE_NOTIFICATIONS") || meetingsNative) {
    try {
      require("./patch-android-gradle-properties.js").patchAndroidGradleProperties();
      const deps = require("./patch-android-app-dependencies.js");
      deps.patchAndroidAppDependencies();
      deps.patchSupportExcludes();
    } catch (e) {
      console.warn("[android-native-postbuild] gradle patches:", e.message);
    }
    if (telephony || isTruthy("EXPO_PUBLIC_NATIVE_NOTIFICATIONS")) {
      copyVoxoNativeAndroid();
    }
    try {
      require("./merge-main-application.js").mergeMainApplication({
        telephony,
        notifications:
          telephony || isTruthy("EXPO_PUBLIC_NATIVE_NOTIFICATIONS")
      });
    } catch (e) {
      console.warn("[android-native-postbuild] MainApplication merge:", e.message);
    }
  }

  if (meetingsNative) {
    try {
      require("./patch-android-daily-meeting.js").patchAndroidDailyMeeting();
    } catch (e) {
      console.warn("[android-native-postbuild] Daily meeting patch:", e.message);
    }
  }

  if (telephony) {
    try {
      require("./apply-callkeep-patch.js");
    } catch (e) {
      console.warn("[android-native-postbuild] CallKeep patch:", e.message);
    }
    try {
      require("./patch-android-main-activity-component.js").patchMainActivityComponentName();
    } catch (e) {
      console.warn("[android-native-postbuild] MainActivity component:", e.message);
    }
    patchMainApplicationPackages();
  }

  try {
    require("./patch-android-styles-dedupe.js").patchAndroidStylesDedupe();
  } catch (e) {
    console.warn("[android-native-postbuild] styles dedupe:", e.message);
  }

  try {
    require("./patch-android-16kb-page-size.js").patchAndroid16kbPageSize();
  } catch (e) {
    console.warn("[android-native-postbuild] 16kb page size:", e.message);
  }

  try {
    require("./patch-android-release-signing.js").patchAndroidReleaseSigning();
  } catch (e) {
    console.warn("[android-native-postbuild] release signing:", e.message);
  }

  return true;
}

function patchMainApplicationPackages() {
  const fs = require("fs");
  const mainApp = path.join(
    __dirname,
    "..",
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
  if (!fs.existsSync(mainApp)) return;
  let body = fs.readFileSync(mainApp, "utf8");
  const packages = [
    "AndroidNotificationsModulePackage()",
    "VoxoDtmfSidetoneModulePackage()",
    "VoxoClipboardModulePackage()"
  ];
  if (!body.includes("AndroidNotificationsModulePackage")) {
    body = body.replace(
      /PackageList\(this\)\.packages\.apply\s*\{/,
      `PackageList(this).packages.apply {\n              add(AndroidNotificationsModulePackage())\n              add(VoxoDtmfSidetoneModulePackage())\n              add(VoxoClipboardModulePackage())`
    );
    if (!body.includes("import co.voxo.android.notifications.module.AndroidNotificationsModulePackage")) {
      body = body.replace(
        "import com.facebook.react.PackageList",
        `import co.voxo.android.clipboard.VoxoClipboardModulePackage\nimport co.voxo.android.calling.module.VoxoDtmfSidetoneModulePackage\nimport co.voxo.android.notifications.module.AndroidNotificationsModulePackage\nimport com.facebook.react.PackageList`
      );
    }
    fs.writeFileSync(mainApp, body);
    console.log("[android-native-postbuild] patched MainApplication packages");
  }
}

module.exports = { runPostPrebuildFixes };
