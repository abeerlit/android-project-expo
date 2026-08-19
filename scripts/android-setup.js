#!/usr/bin/env node
/**
 * DOOK Android — expo prebuild + native copy + gradle verify
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { loadEnv } = require("./load-env");
const { runPostPrebuildFixes } = require("./android-native-postbuild");

const ROOT = path.join(__dirname, "..");

function run(cmd, opts = {}) {
  console.log(`\n[android:setup] ▶ ${cmd}\n`);
  execSync(cmd, { cwd: ROOT, stdio: "inherit", env: { ...process.env }, ...opts });
}

function step(label, fn) {
  console.log(`\n[android:setup] —— ${label} ——\n`);
  fn();
}

function main() {
  const args = new Set(process.argv.slice(2));
  const prebuildClean = args.has("--prebuild-clean") || args.has("--clean");
  const verify = args.has("--verify");
  const androidDir = path.join(ROOT, "android");
  const prebuild =
    prebuildClean ||
    args.has("--prebuild") ||
    verify ||
    !fs.existsSync(androidDir);

  loadEnv();
  console.log("[android:setup] EXPO_PUBLIC_NATIVE_TELEPHONY=", process.env.EXPO_PUBLIC_NATIVE_TELEPHONY ?? "(unset)");
  console.log("[android:setup] EXPO_PUBLIC_MEETINGS_NATIVE=", process.env.EXPO_PUBLIC_MEETINGS_NATIVE ?? "(unset)");

  if (prebuild) {
    step("expo prebuild (android)", () => {
      const cleanFlag = prebuildClean ? " --clean" : "";
      run(`npx expo prebuild --platform android${cleanFlag}`);
    });
  } else if (!fs.existsSync(path.join(ROOT, "android"))) {
    console.error("[android:setup] android/ missing — run: npm run android:setup:clean");
    process.exit(1);
  }

  step("native post-prebuild", () => {
    if (!runPostPrebuildFixes()) process.exit(1);
  });

  step("gradle assembleDebug", () => {
    const gradlew = path.join(ROOT, "android", process.platform === "win32" ? "gradlew.bat" : "gradlew");
    if (!fs.existsSync(gradlew)) {
      console.error("[android:setup] gradlew missing");
      process.exit(1);
    }
    run(`cd android && ${process.platform === "win32" ? "gradlew.bat" : "./gradlew"} assembleDebug`);
  });

  if (verify) {
    console.log("[android:setup] verify complete");
  }

  console.log("\n[android:setup] ✓ Done");
  console.log("[android:setup] Run: npm run start:device && npm run android");
}

main();
