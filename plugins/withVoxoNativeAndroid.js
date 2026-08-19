const path = require("path");
const { withDangerousMod } = require("@expo/config-plugins");

function withVoxoNativeAndroid(config) {
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const { copyVoxoNativeAndroid } = require(
        path.join(cfg.modRequest.projectRoot, "scripts", "copy-voxo-native-android.js")
      );
      copyVoxoNativeAndroid();
      try {
        require(path.join(cfg.modRequest.projectRoot, "scripts", "patch-android-splash-theme.js")).patchSplashTheme();
      } catch (e) {
        console.warn("[withVoxoNativeAndroid] splash theme:", e.message);
      }
      try {
        require(path.join(
          cfg.modRequest.projectRoot,
          "scripts",
          "patch-android-styles-dedupe.js"
        )).patchAndroidStylesDedupe();
      } catch (e) {
        console.warn("[withVoxoNativeAndroid] styles dedupe:", e.message);
      }
      return cfg;
    }
  ]);
}

module.exports = { withVoxoNativeAndroid };
