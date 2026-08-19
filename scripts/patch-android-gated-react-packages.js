#!/usr/bin/env node
/**
 * Safety net when autolinking.json includes chat native modules but PackageList
 * was generated without them (RTNGiphySDKModule not found crashes).
 *
 * When PackageList already includes a package, strip any manual duplicate from
 * MainApplication.kt (avoids RTNGiphyVideoManager override crash).
 */
const fs = require("fs");
const path = require("path");
const { loadEnv, isTruthy } = require("./load-env");

const ROOT = path.join(__dirname, "..");
const MAIN_APP = path.join(
  ROOT,
  "android",
  "app",
  "src",
  "main",
  "java",
  "co",
  "voxo",
  "android",
  "MainApplication.kt"
);
const AUTOLINKING_JSON = path.join(
  ROOT,
  "android",
  "build",
  "generated",
  "autolinking",
  "autolinking.json"
);
const PACKAGE_LIST = path.join(
  ROOT,
  "android",
  "app",
  "build",
  "generated",
  "autolinking",
  "src",
  "main",
  "java",
  "com",
  "facebook",
  "react",
  "PackageList.java"
);

const MARKER = "// voxo-gated-react-packages";

const CHAT_PACKAGES = [
  {
    autolinkKey: "@giphy/react-native-sdk",
    importPath: "import com.giphyreactnativesdk.RTNGiphySdkPackage",
    instance: "RTNGiphySdkPackage()",
    sentinel: "RTNGiphySdkPackage"
  },
  {
    autolinkKey: "@10play/tentap-editor",
    importPath: "import com.tentap.TenTapViewPackage",
    instance: "TenTapViewPackage()",
    sentinel: "TenTapViewPackage"
  }
];

function autolinkingIncludes(key) {
  if (!fs.existsSync(AUTOLINKING_JSON)) return false;
  const json = JSON.parse(fs.readFileSync(AUTOLINKING_JSON, "utf8"));
  return Boolean(json.dependencies?.[key]);
}

function packageListIncludes(sentinel) {
  if (!fs.existsSync(PACKAGE_LIST)) return false;
  return fs.readFileSync(PACKAGE_LIST, "utf8").includes(sentinel);
}

function stripManualChatPackages(body) {
  let next = body;

  if (next.includes(MARKER)) {
    next = next.replace(
      new RegExp(`\\s*${MARKER}[\\s\\S]*?(?=\\n\\s*// Packages|\\n\\s*add\\(|\\n\\s*\\})`),
      ""
    );
  }

  for (const pkg of CHAT_PACKAGES) {
    next = next.replace(new RegExp(`\\s*add\\(${pkg.instance}\\)\\n?`, "g"), "");
    if (!next.includes(pkg.sentinel.replace("Package", ""))) {
      next = next.replace(new RegExp(`${pkg.importPath}\\n`, "g"), "");
    }
  }

  for (const pkg of CHAT_PACKAGES) {
    if (next.includes(pkg.sentinel) && !next.includes(pkg.importPath)) {
      next = next.replace(
        "import com.facebook.react.PackageList",
        `${pkg.importPath}\nimport com.facebook.react.PackageList`
      );
    }
  }

  return next;
}

function addManualChatPackages(body, toAdd) {
  let next = body;

  for (const pkg of toAdd) {
    if (!next.includes(pkg.importPath)) {
      next = next.replace(
        "import com.facebook.react.PackageList",
        `${pkg.importPath}\nimport com.facebook.react.PackageList`
      );
    }
  }

  const addLines = toAdd.map((pkg) => `              add(${pkg.instance})`).join("\n");
  const packagesApply = /PackageList\(this\)\.packages\.apply\s*\{/;
  if (!packagesApply.test(next)) {
    console.warn("[patch-gated-packages] PackageList apply block not found");
    return null;
  }

  next = next.replace(
    packagesApply,
    `PackageList(this).packages.apply {\n              ${MARKER}\n${addLines}`
  );

  return next;
}

function patchAndroidGatedReactPackages() {
  loadEnv();
  if (!isTruthy("EXPO_PUBLIC_CHAT_NATIVE")) {
    return true;
  }
  if (!fs.existsSync(MAIN_APP)) {
    console.warn("[patch-gated-packages] skip — MainApplication.kt missing");
    return false;
  }

  let body = fs.readFileSync(MAIN_APP, "utf8");
  const autolinkedInPackageList = CHAT_PACKAGES.filter((pkg) =>
    packageListIncludes(pkg.sentinel)
  );

  if (autolinkedInPackageList.length) {
    const cleaned = stripManualChatPackages(body);
    if (cleaned !== body) {
      fs.writeFileSync(MAIN_APP, cleaned);
      console.log(
        `[patch-gated-packages] removed manual duplicates already in PackageList: ${autolinkedInPackageList
          .map((p) => p.sentinel)
          .join(", ")}`
      );
      body = cleaned;
    } else {
      console.log(
        "[patch-gated-packages] PackageList already includes chat native modules"
      );
    }
    return true;
  }

  const needed = CHAT_PACKAGES.filter(
    (pkg) =>
      autolinkingIncludes(pkg.autolinkKey) && !body.includes(`add(${pkg.instance})`)
  );
  if (!needed.length) {
    console.log("[patch-gated-packages] chat packages already in MainApplication");
    return true;
  }

  const next = addManualChatPackages(body, needed);
  if (!next) return false;

  fs.writeFileSync(MAIN_APP, next);
  console.log(
    `[patch-gated-packages] registered ${needed.map((p) => p.sentinel).join(", ")}`
  );
  return true;
}

module.exports = { patchAndroidGatedReactPackages };

if (require.main === module) {
  patchAndroidGatedReactPackages();
}
