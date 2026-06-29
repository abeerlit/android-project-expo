#!/usr/bin/env node
/**
 * Prebuild + bare theme merge can leave duplicate AppTheme / AppTheme.Fullscreen entries.
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

function countStyle(body, name) {
  const escaped = name.replace(/\./g, "\\.");
  const re = new RegExp(`<style\\s+name="${escaped}"(?:\\s|>)`, "g");
  return (body.match(re) || []).length;
}

function patchAndroidStylesDedupe() {
  if (!fs.existsSync(STYLES)) {
    console.warn("[patch-styles-dedupe] skip — no styles.xml");
    return false;
  }

  let body = fs.readFileSync(STYLES, "utf8");
  if (countStyle(body, "AppTheme") <= 1 && countStyle(body, "AppTheme.Fullscreen") <= 1) {
    console.log("[patch-styles-dedupe] styles.xml already unique");
    return true;
  }

  const hasReset = body.includes('name="ResetEditText"');
  const hasColorPrimary = body.includes("colorPrimary");
  const hasSplash = body.includes("Theme.App.SplashScreen");

  const lines = [
    '<resources xmlns:tools="http://schemas.android.com/tools">',
    '  <style name="AppTheme" parent="Theme.AppCompat.DayNight.NoActionBar">',
    '    <item name="android:textColor">@android:color/black</item>'
  ];
  if (hasReset) {
    lines.push('    <item name="android:editTextStyle">@style/ResetEditText</item>');
  }
  lines.push(
    '    <item name="android:editTextBackground">@drawable/rn_edit_text_material</item>'
  );
  if (hasColorPrimary) {
    lines.push('    <item name="colorPrimary">@color/colorPrimary</item>');
    lines.push('    <item name="android:statusBarColor">#ffffff</item>');
  }
  lines.push("  </style>");

  if (hasReset) {
    lines.push(
      '  <style name="ResetEditText" parent="@android:style/Widget.EditText">',
      '    <item name="android:padding">0dp</item>',
      '    <item name="android:textColorHint">#c8c8c8</item>',
      '    <item name="android:textColor">@android:color/black</item>',
      "  </style>"
    );
  }

  lines.push(
    '  <style name="AppTheme.Fullscreen" parent="AppTheme">',
    '    <item name="android:windowActionBarOverlay">true</item>',
    '    <item name="android:windowBackground">@null</item>',
    "  </style>",
    '  <style name="AppTheme.Transparent" parent="Theme.AppCompat.DayNight.NoActionBar">',
    '    <item name="android:windowIsTranslucent">true</item>',
    '    <item name="android:windowBackground">@android:color/transparent</item>',
    '    <item name="android:windowContentOverlay">@null</item>',
    '    <item name="android:windowNoTitle">true</item>',
    "  </style>"
  );

  if (hasSplash) {
    lines.push(
      '  <style name="Theme.App.SplashScreen" parent="AppTheme">',
      '    <item name="windowSplashScreenBackground">@color/splashscreen_background</item>',
      '    <item name="windowSplashScreenAnimatedIcon">@drawable/splashscreen_logo</item>',
      '    <item name="postSplashScreenTheme">@style/AppTheme</item>',
      "  </style>"
    );
  }

  lines.push("</resources>");
  fs.writeFileSync(STYLES, `${lines.join("\n")}\n`);
  console.log("[patch-styles-dedupe] rewrote styles.xml (removed duplicate AppTheme)");
  return true;
}

module.exports = { patchAndroidStylesDedupe };

if (require.main === module) {
  patchAndroidStylesDedupe();
}
