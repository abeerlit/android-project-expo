#!/usr/bin/env node
/**
 * Copy VoxoClipboard native module + FileProvider (chat image copy) into Expo android/.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const BARE_MAIN = path.join(ROOT, "native-android", "main");
const ANDROID_MAIN = path.join(ROOT, "android", "app", "src", "main");

const FILE_PROVIDER_SNIPPET = `
      <provider
        android:name="androidx.core.content.FileProvider"
        android:authorities="\${applicationId}.fileprovider"
        android:exported="false"
        android:grantUriPermissions="true">
        <meta-data
          android:name="android.support.FILE_PROVIDER_PATHS"
          android:resource="@xml/file_paths" />
      </provider>`;

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function copyVoxoClipboardNative() {
  if (!fs.existsSync(ANDROID_MAIN)) {
    console.warn("[patch-android-clipboard] skip — no android/ app src");
    return false;
  }

  const clipboardSrc = path.join(BARE_MAIN, "java", "co", "voxo", "android", "clipboard");
  const clipboardDest = path.join(ANDROID_MAIN, "java", "co", "voxo", "android", "clipboard");
  if (!fs.existsSync(clipboardSrc)) {
    console.warn("[patch-android-clipboard] bare clipboard sources missing");
    return false;
  }
  copyDir(clipboardSrc, clipboardDest);
  console.log("[patch-android-clipboard] copied co.voxo.android.clipboard");

  const filePathsSrc = path.join(BARE_MAIN, "res", "xml", "file_paths.xml");
  const filePathsDest = path.join(ANDROID_MAIN, "res", "xml", "file_paths.xml");
  if (fs.existsSync(filePathsSrc)) {
    fs.mkdirSync(path.dirname(filePathsDest), { recursive: true });
    fs.copyFileSync(filePathsSrc, filePathsDest);
    console.log("[patch-android-clipboard] copied res/xml/file_paths.xml");
  }

  return true;
}

function patchAndroidManifestFileProvider() {
  const manifest = path.join(ANDROID_MAIN, "AndroidManifest.xml");
  if (!fs.existsSync(manifest)) return false;
  let body = fs.readFileSync(manifest, "utf8");
  if (body.includes("androidx.core.content.FileProvider")) {
    return true;
  }
  if (!body.includes("</application>")) {
    console.warn("[patch-android-clipboard] AndroidManifest missing </application>");
    return false;
  }
  body = body.replace("</application>", `${FILE_PROVIDER_SNIPPET}\n  </application>`);
  fs.writeFileSync(manifest, body);
  console.log("[patch-android-clipboard] added FileProvider to AndroidManifest.xml");
  return true;
}

function mergeClipboardMainApplication() {
  const mainApp = path.join(
    ANDROID_MAIN,
    "java",
    "co",
    "voxo",
    "android",
    "MainApplication.kt"
  );
  if (!fs.existsSync(mainApp)) {
    console.warn("[patch-android-clipboard] MainApplication.kt missing");
    return false;
  }

  let body = fs.readFileSync(mainApp, "utf8");
  if (body.includes("VoxoClipboardModulePackage")) {
    return true;
  }

  if (body.includes("PackageList(this).packages.apply")) {
    body = body.replace(
      /PackageList\(this\)\.packages\.apply\s*\{/,
      "PackageList(this).packages.apply {\n              add(VoxoClipboardModulePackage())"
    );
  } else if (/val packages = PackageList\(this\)\.packages/.test(body)) {
    body = body.replace(
      /val packages = PackageList\(this\)\.packages\n([\s\S]*?)return packages/,
      `val packages = PackageList(this).packages.apply {
              add(VoxoClipboardModulePackage())
            }
            return packages`
    );
  } else {
    console.warn("[patch-android-clipboard] unexpected MainApplication packages block");
    return false;
  }

  if (!body.includes("import co.voxo.android.clipboard.VoxoClipboardModulePackage")) {
    body = body.replace(
      "import com.facebook.react.PackageList",
      "import co.voxo.android.clipboard.VoxoClipboardModulePackage\nimport com.facebook.react.PackageList"
    );
  }

  fs.writeFileSync(mainApp, body);
  console.log("[patch-android-clipboard] registered VoxoClipboardModulePackage");
  return true;
}

function patchAndroidClipboard() {
  const ok =
    copyVoxoClipboardNative() &&
    patchAndroidManifestFileProvider() &&
    mergeClipboardMainApplication();
  return ok;
}

module.exports = {
  copyVoxoClipboardNative,
  patchAndroidManifestFileProvider,
  mergeClipboardMainApplication,
  patchAndroidClipboard
};

if (require.main === module) {
  const ok = patchAndroidClipboard();
  process.exit(ok ? 0 : 1);
}
