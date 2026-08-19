#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function patchAppAuthScheme() {
  const gradle = path.join(__dirname, "..", "android", "app", "build.gradle");
  const scheme = process.env.ANDROID_PACKAGE ?? "co.voxo.android";

  if (!fs.existsSync(gradle)) {
    return false;
  }

  let body = fs.readFileSync(gradle, "utf8");
  if (body.includes("appAuthRedirectScheme")) {
    return true;
  }

  body = body.replace(
    /defaultConfig\s*\{/,
    `defaultConfig {
        manifestPlaceholders = [appAuthRedirectScheme: "${scheme}"]`
  );
  fs.writeFileSync(gradle, body);
  console.log("[patch-app-auth-scheme] manifestPlaceholders added");
  return true;
}

module.exports = { patchAppAuthScheme };

if (require.main === module) {
  process.exit(patchAppAuthScheme() ? 0 : 1);
}
