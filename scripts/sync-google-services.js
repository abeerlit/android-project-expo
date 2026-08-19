#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function syncGoogleServices() {
  const root = path.join(__dirname, "..");
  const src = path.join(root, "native-resources", "google-services.json");
  const dest = path.join(root, "android", "app", "google-services.json");

  if (!fs.existsSync(src)) {
    console.warn(
      "[sync-google-services] missing native-resources/google-services.json — add Firebase config"
    );
    return false;
  }

  if (fs.existsSync(path.join(root, "android", "app"))) {
    fs.copyFileSync(src, dest);
    console.log("[sync-google-services] copied to android/app/");
    return true;
  }
  return false;
}

module.exports = { syncGoogleServices };

if (require.main === module) {
  process.exit(syncGoogleServices() ? 0 : 1);
}
