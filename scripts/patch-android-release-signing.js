#!/usr/bin/env node
/**
 * Sign release builds with the Play Console upload keystore (voxo.keystore).
 * Local `bundleRelease` uses debug signing by default after expo prebuild.
 */
const fs = require("fs");
const path = require("path");
const { loadEnv } = require("./load-env");

const ROOT = path.join(__dirname, "..");
const APP_BUILD = path.join(ROOT, "android", "app", "build.gradle");
const GRADLE_PROPS = path.join(ROOT, "android", "gradle.properties");
const APP_KEYSTORE = path.join(ROOT, "android", "app", "voxo.keystore");

const MARKER = "// voxo-release-signing";

const DEFAULT_SOURCES = [
  path.join(ROOT, "native-resources", "voxo.keystore"),
  path.join(ROOT, "..", "android-project", "android", "app", "voxo.keystore"),
  path.join(
    ROOT,
    "..",
    "voxo-connect-mobile-expo",
    "android-project-expo",
    "android",
    "app",
    "voxo.keystore"
  )
];

function resolveKeystoreSource() {
  const fromEnv = process.env.VOXO_ANDROID_KEYSTORE?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  for (const candidate of DEFAULT_SOURCES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function syncUploadKeystore() {
  const source = resolveKeystoreSource();
  if (!source) {
    console.warn(
      "[patch-release-signing] voxo.keystore not found — set VOXO_ANDROID_KEYSTORE or copy to native-resources/voxo.keystore"
    );
    return false;
  }
  fs.mkdirSync(path.dirname(APP_KEYSTORE), { recursive: true });
  if (!fs.existsSync(APP_KEYSTORE) || fs.statSync(source).mtimeMs > fs.statSync(APP_KEYSTORE).mtimeMs) {
    fs.copyFileSync(source, APP_KEYSTORE);
    console.log(`[patch-release-signing] copied keystore from ${source}`);
  }
  return true;
}

function patchGradleProperties() {
  if (!fs.existsSync(GRADLE_PROPS)) return false;
  let body = fs.readFileSync(GRADLE_PROPS, "utf8");

  const storeFile = process.env.MYAPP_UPLOAD_STORE_FILE ?? "voxo.keystore";
  const keyAlias = process.env.MYAPP_UPLOAD_KEY_ALIAS ?? "voxo-android";
  const storePassword =
    process.env.MYAPP_UPLOAD_STORE_PASSWORD ?? process.env.VOXO_ANDROID_KEYSTORE_PASSWORD ?? "Password1!";
  const keyPassword =
    process.env.MYAPP_UPLOAD_KEY_PASSWORD ?? process.env.VOXO_ANDROID_KEY_PASSWORD ?? storePassword;

  const block = `${MARKER}
MYAPP_UPLOAD_STORE_FILE=${storeFile}
MYAPP_UPLOAD_KEY_ALIAS=${keyAlias}
MYAPP_UPLOAD_STORE_PASSWORD=${storePassword}
MYAPP_UPLOAD_KEY_PASSWORD=${keyPassword}
`;

  if (body.includes(MARKER)) {
    body = body.replace(
      new RegExp(`${MARKER}[\\s\\S]*?(?=\\n#|\\n[a-zA-Z]|$)`),
      block.trimEnd()
    );
  } else {
    body = `${body.trimEnd()}\n${block}`;
  }

  fs.writeFileSync(GRADLE_PROPS, body.endsWith("\n") ? body : `${body}\n`);
  return true;
}

function patchAppBuildGradle() {
  if (!fs.existsSync(APP_BUILD)) return false;
  let body = fs.readFileSync(APP_BUILD, "utf8");

  if (!body.includes("signingConfigs {")) return false;

  if (!body.includes("MYAPP_UPLOAD_STORE_FILE")) {
    body = body.replace(
      /(signingConfigs\s*\{\s*debug\s*\{[\s\S]*?\n\s*\}\s*)/,
      `$1
        release {
            if (project.hasProperty('MYAPP_UPLOAD_STORE_FILE')) {
                storeFile file(MYAPP_UPLOAD_STORE_FILE)
                storePassword MYAPP_UPLOAD_STORE_PASSWORD
                keyAlias MYAPP_UPLOAD_KEY_ALIAS
                keyPassword MYAPP_UPLOAD_KEY_PASSWORD
            }
        }
`
    );
  }

  body = body.replace(
    /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/,
    "$1signingConfig signingConfigs.release"
  );

  fs.writeFileSync(APP_BUILD, body);
  return true;
}

function patchAndroidReleaseSigning() {
  loadEnv();
  if (!fs.existsSync(path.join(ROOT, "android", "app"))) {
    console.warn("[patch-release-signing] skip — no android/ (run prebuild first)");
    return false;
  }
  if (!syncUploadKeystore()) return false;
  patchGradleProperties();
  patchAppBuildGradle();
  console.log("[patch-release-signing] release signing configured (voxo.keystore)");
  return true;
}

module.exports = { patchAndroidReleaseSigning };

if (require.main === module) {
  patchAndroidReleaseSigning();
}
