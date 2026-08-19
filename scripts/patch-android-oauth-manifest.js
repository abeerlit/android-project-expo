#!/usr/bin/env node
/**
 * Remove co.voxo.android (OAuth) from MainActivity intent-filters after prebuild.
 * AppAuth RedirectUriReceiverActivity must be the sole handler for that scheme.
 */
const fs = require("fs");
const path = require("path");

const MANIFEST = path.join(
  __dirname,
  "..",
  "android",
  "app",
  "src",
  "main",
  "AndroidManifest.xml"
);

const OAUTH_SCHEME = process.env.ANDROID_PACKAGE ?? "co.voxo.android";

function patchAndroidOAuthManifest() {
  if (!fs.existsSync(MANIFEST)) {
    console.warn("[patch-oauth-manifest] skip — no AndroidManifest.xml");
    return false;
  }

  let body = fs.readFileSync(MANIFEST, "utf8");
  const before = body;

  // Drop duplicate / OAuth scheme lines on MainActivity (keep exp+ dev-client scheme).
  const schemeLine = new RegExp(
    `\\s*<data android:scheme="${OAUTH_SCHEME.replace(/\./g, "\\.")}"/>\\n?`,
    "g"
  );
  body = body.replace(schemeLine, "");

  // Remove empty VIEW intent-filter blocks left with only expo dev scheme or nothing.
  body = body.replace(
    /<intent-filter>\s*<action android:name="android\.intent\.action\.VIEW"\/>\s*<category android:name="android\.intent\.category\.DEFAULT"\/>\s*<category android:name="android\.intent\.category\.BROWSABLE"\/>\s*<\/intent-filter>\s*/g,
    ""
  );

  if (body === before) {
    console.log("[patch-oauth-manifest] already patched (no oauth scheme on MainActivity)");
    return true;
  }

  fs.writeFileSync(MANIFEST, body);
  console.log(
    "[patch-oauth-manifest] removed OAuth scheme from MainActivity (AppAuth only)"
  );
  return true;
}

module.exports = { patchAndroidOAuthManifest };

if (require.main === module) {
  process.exit(patchAndroidOAuthManifest() ? 0 : 1);
}
