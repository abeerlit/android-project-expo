const path = require("path");
const { withDangerousMod } = require("@expo/config-plugins");

/**
 * Gradle patches that must run during `expo prebuild` (EAS), not only local android:setup.
 */
function withVoxoAndroidGradle(config, options = {}) {
  const telephony = options.enableTelephony === true;
  const notifications =
    options.enableNotifications === true || telephony;
  const nativeDeps =
    options.enableNativeCopy === true || telephony || notifications;

  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const root = cfg.modRequest.projectRoot;
      const load = (file) =>
        require(path.join(root, "scripts", file));

      try {
        load("patch-android-gradle-properties.js").patchAndroidGradleProperties();
      } catch (e) {
        console.warn("[withVoxoAndroidGradle] gradle.properties:", e.message);
      }

      try {
        load("patch-android-app-dependencies.js").patchSupportExcludes();
      } catch (e) {
        console.warn("[withVoxoAndroidGradle] support excludes:", e.message);
      }

      if (nativeDeps) {
        try {
          load("patch-android-app-dependencies.js").patchAndroidAppDependencies();
        } catch (e) {
          console.warn("[withVoxoAndroidGradle] app dependencies:", e.message);
        }
        try {
          load("patch-android-notifee-maven.js").patchAndroidNotifeeMaven();
        } catch (e) {
          console.warn("[withVoxoAndroidGradle] notifee maven:", e.message);
        }
        try {
          load("patch-android-16kb-page-size.js").patchAndroid16kbPageSize();
        } catch (e) {
          console.warn("[withVoxoAndroidGradle] 16kb page size:", e.message);
        }
      }

      return cfg;
    }
  ]);
}

module.exports = { withVoxoAndroidGradle };
