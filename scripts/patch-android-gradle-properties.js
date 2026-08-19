#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const GRADLE_PROPS = path.join(__dirname, "..", "android", "gradle.properties");

function patchAndroidGradleProperties() {
  if (!fs.existsSync(GRADLE_PROPS)) return false;
  let body = fs.readFileSync(GRADLE_PROPS, "utf8");
  if (body.includes("android.enableJetifier=true")) {
    body = body.replace(/\n?# Migrate legacy support libs[^\n]*\nandroid\.enableJetifier=true\n?/g, "\n");
    fs.writeFileSync(GRADLE_PROPS, body);
    console.log("[patch-gradle-props] removed android.enableJetifier (OOM on RN 0.76)");
  }
  return true;
}

module.exports = { patchAndroidGradleProperties };

if (require.main === module) {
  patchAndroidGradleProperties();
}
