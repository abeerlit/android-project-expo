#!/usr/bin/env node
/**
 * Optional manual sync from android-project into vendored trees (not run on postinstall).
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const bareRoot = path.resolve(root, "..", "android-project");
const bareSrc = path.join(bareRoot, "src");
const bareMain = path.join(bareRoot, "android", "app", "src", "main");

if (!fs.existsSync(bareSrc)) {
  console.error("[vendor-sync-bare] android-project/src not found");
  process.exit(1);
}

execSync(`rsync -a --delete "${bareSrc}/" "${path.join(root, "src")}/"`, {
  stdio: "inherit"
});
console.log("[vendor-sync-bare] synced src/");

if (fs.existsSync(bareMain)) {
  const nativeMain = path.join(root, "native-android", "main");
  const nativeRef = path.join(root, "native-android", "reference");
  fs.mkdirSync(nativeMain, { recursive: true });
  execSync(`rsync -a "${path.join(bareMain, "java")}/" "${path.join(nativeMain, "java")}/"`, {
    stdio: "inherit"
  });
  execSync(`rsync -a "${path.join(bareMain, "res")}/" "${path.join(nativeMain, "res")}/"`, {
    stdio: "inherit"
  });
  const mainApp = path.join(bareMain, "java", "co", "voxo", "android", "MainApplication.kt");
  if (fs.existsSync(mainApp)) {
    fs.mkdirSync(nativeRef, { recursive: true });
    fs.copyFileSync(mainApp, path.join(nativeRef, "MainApplication.kt"));
  }
  console.log("[vendor-sync-bare] synced native-android/");
}

const headlessBare = path.join(bareRoot, "AndroidHandleSipCallHeadlessTask.ts");
const headlessDest = path.join(
  root,
  "expo-shell",
  "headless",
  "AndroidHandleSipCallHeadlessTask.ts"
);
if (fs.existsSync(headlessBare)) {
  let body = fs.readFileSync(headlessBare, "utf8");
  body = body
    .replace(/from "\.\/src\/store\//g, 'from "store/')
    .replace(/from "\.\/src\/core\//g, 'from "core/');
  fs.writeFileSync(headlessDest, body);
  console.log("[vendor-sync-bare] synced expo-shell/headless/AndroidHandleSipCallHeadlessTask.ts");
}

console.log("[vendor-sync-bare] done — re-apply Expo-specific src edits if needed");
