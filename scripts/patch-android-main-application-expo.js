#!/usr/bin/env node
/**
 * Ensure Expo dev-client / expo-updates hooks exist in MainApplication.kt.
 * Without ReactNativeHostWrapper + ApplicationLifecycleDispatcher the app crashes on launch:
 * "UpdatesController.instance was called before the module was initialized"
 */
const fs = require("fs");
const path = require("path");

const MAIN_APP = path.join(
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

function patchMainApplicationExpo() {
  if (!fs.existsSync(MAIN_APP)) {
    console.warn("[patch-main-application-expo] skip — MainApplication.kt missing");
    return false;
  }

  let body = fs.readFileSync(MAIN_APP, "utf8");
  let changed = false;

  if (!body.includes("import expo.modules.ApplicationLifecycleDispatcher")) {
    body = body.replace(
      "import com.facebook.soloader.SoLoader",
      "import com.facebook.soloader.SoLoader\nimport expo.modules.ApplicationLifecycleDispatcher\nimport expo.modules.ReactNativeHostWrapper"
    );
    changed = true;
  }

  if (!body.includes("import android.content.res.Configuration")) {
    body = body.replace(
      "import android.app.Application",
      "import android.app.Application\nimport android.content.res.Configuration"
    );
    changed = true;
  }

  if (!body.includes("ReactNativeHostWrapper(")) {
    body = body.replace(
      /override val reactNativeHost: ReactNativeHost\s*=\s*\n\s*object : DefaultReactNativeHost\(this\) \{/,
      "override val reactNativeHost: ReactNativeHost = ReactNativeHostWrapper(\n      this,\n      object : DefaultReactNativeHost(this) {"
    );
    body = body.replace(
      /(override val isHermesEnabled: Boolean = BuildConfig\.IS_HERMES_ENABLED\n)(\s*)\}/,
      "$1$2      }\n  )"
    );
    changed = true;
  }

  if (body.includes("getDefaultReactHost(applicationContext, reactNativeHost)")) {
    body = body.replace(
      "get() = getDefaultReactHost(applicationContext, reactNativeHost)",
      "get() = ReactNativeHostWrapper.createReactHost(applicationContext, reactNativeHost)"
    );
    body = body.replace(
      "import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost\n",
      ""
    );
    changed = true;
  }

  if (!body.includes("ApplicationLifecycleDispatcher.onApplicationCreate(this)")) {
    if (body.includes("startNativeSipIfLoggedIn()")) {
      body = body.replace(
        /startNativeSipIfLoggedIn\(\)\n/,
        "startNativeSipIfLoggedIn()\n    ApplicationLifecycleDispatcher.onApplicationCreate(this)\n"
      );
    } else if (body.includes("initCallKeep()")) {
      body = body.replace(
        /initCallKeep\(\)\n/,
        "initCallKeep()\n    ApplicationLifecycleDispatcher.onApplicationCreate(this)\n"
      );
    } else {
      body = body.replace(
        /SoLoader\.init\(this, OpenSourceMergedSoMapping\)\n/,
        "SoLoader.init(this, OpenSourceMergedSoMapping)\n    ApplicationLifecycleDispatcher.onApplicationCreate(this)\n"
      );
    }
    changed = true;
  }

  if (!body.includes("ApplicationLifecycleDispatcher.onConfigurationChanged")) {
    body = body.replace(
      /(\n  override fun onCreate\(\) \{[\s\S]*?\n  \})\n/,
      `$1

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }

`
    );
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(MAIN_APP, body);
    console.log("[patch-main-application-expo] patched MainApplication.kt");
  }

  return changed;
}

module.exports = { patchMainApplicationExpo };

if (require.main === module) {
  patchMainApplicationExpo();
}
