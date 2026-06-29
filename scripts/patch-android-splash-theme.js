#!/usr/bin/env node
/**
 * Expo prebuild sets MainActivity theme to Theme.App.SplashScreen (parent Theme.SplashScreen),
 * which is not AppCompat — ReactActivity crashes on launch. Use AppTheme as parent instead.
 */
const fs = require("fs");
const path = require("path");

const STYLES = path.join(
  __dirname,
  "..",
  "android",
  "app",
  "src",
  "main",
  "res",
  "values",
  "styles.xml"
);

const MANIFEST = path.join(__dirname, "..", "android", "app", "src", "main", "AndroidManifest.xml");

function patchSplashTheme() {
  if (!fs.existsSync(STYLES)) {
    console.warn("[patch-splash-theme] skip — no styles.xml");
    return false;
  }
  let body = fs.readFileSync(STYLES, "utf8");
  const before = body;
  body = body.replace(
    /<style name="Theme\.App\.SplashScreen" parent="Theme\.SplashScreen">/,
    '<style name="Theme.App.SplashScreen" parent="AppTheme">'
  );
  if (body !== before) {
    fs.writeFileSync(STYLES, body);
    console.log("[patch-splash-theme] Theme.App.SplashScreen parent -> AppTheme (AppCompat)");
  }

  if (fs.existsSync(MANIFEST)) {
    let manifest = fs.readFileSync(MANIFEST, "utf8");
    const mBefore = manifest;
    manifest = manifest.replace(
      /android:name="\.MainActivity"([^>]*?)android:theme="@style\/Theme\.App\.SplashScreen"/,
      'android:name=".MainActivity"$1android:theme="@style/AppTheme"'
    );
    if (manifest !== mBefore) {
      fs.writeFileSync(MANIFEST, manifest);
      console.log("[patch-splash-theme] MainActivity theme -> AppTheme");
    }
  }
  return true;
}

module.exports = { patchSplashTheme };

if (require.main === module) {
  patchSplashTheme();
}
