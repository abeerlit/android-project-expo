#!/usr/bin/env node
/**
 * Expo dev client registers JS as "main"; bare-copied MainActivity.kt uses "VOXOConnect".
 * Align native with Expo so a native-only rebuild is not required for the name mismatch.
 */
const fs = require("fs");
const path = require("path");

const MAIN_ACTIVITY = path.join(
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
  "MainActivity.kt"
);

function patchMainActivityComponentName() {
  if (!fs.existsSync(MAIN_ACTIVITY)) return false;
  let body = fs.readFileSync(MAIN_ACTIVITY, "utf8");
  const next = body.replace(
    /override fun getMainComponentName\(\): String = "VOXOConnect"/,
    'override fun getMainComponentName(): String = "main"'
  );
  if (next === body) return true;
  fs.writeFileSync(MAIN_ACTIVITY, next);
  console.log('[patch-main-activity] getMainComponentName -> "main" (Expo dev client)');
  return true;
}

module.exports = { patchMainActivityComponentName };

if (require.main === module) {
  patchMainActivityComponentName();
}
