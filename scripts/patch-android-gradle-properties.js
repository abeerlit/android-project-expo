#!/usr/bin/env node
/**
 * Keep android/gradle.properties healthy across prebuild regenerations.
 * - Drop Jetifier (OOM on RN 0.76)
 * - Raise JVM heap/metaspace (lintVitalAnalyzeRelease OOMs at 512m metaspace)
 * - Suppress AGP 8.7 vs compileSdk 36 warning noise
 */
const fs = require("fs");
const path = require("path");

const GRADLE_PROPS = path.join(__dirname, "..", "android", "gradle.properties");

const JVM_ARGS =
  "org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m -XX:+HeapDumpOnOutOfMemoryError";

function upsertLine(body, keyPrefix, line) {
  const re = new RegExp(`^${keyPrefix.replace(/\./g, "\\.")}.*$`, "m");
  if (re.test(body)) {
    return body.replace(re, line);
  }
  return `${body.trimEnd()}\n${line}\n`;
}

function patchAndroidGradleProperties() {
  if (!fs.existsSync(GRADLE_PROPS)) return false;
  let body = fs.readFileSync(GRADLE_PROPS, "utf8");
  let changed = false;

  if (body.includes("android.enableJetifier=true")) {
    body = body.replace(
      /\n?# Migrate legacy support libs[^\n]*\nandroid\.enableJetifier=true\n?/g,
      "\n"
    );
    changed = true;
    console.log(
      "[patch-gradle-props] removed android.enableJetifier (OOM on RN 0.76)"
    );
  }

  if (!body.includes("MaxMetaspaceSize=1024m")) {
    body = upsertLine(body, "org.gradle.jvmargs", JVM_ARGS);
    changed = true;
    console.log(
      "[patch-gradle-props] raised JVM heap/metaspace for release lint"
    );
  }

  if (!/^android\.suppressUnsupportedCompileSdk=/m.test(body)) {
    body = upsertLine(
      body,
      "android.suppressUnsupportedCompileSdk",
      "android.suppressUnsupportedCompileSdk=36"
    );
    changed = true;
    console.log("[patch-gradle-props] suppressUnsupportedCompileSdk=36");
  }

  if (changed) {
    fs.writeFileSync(GRADLE_PROPS, body.endsWith("\n") ? body : `${body}\n`);
  }
  return true;
}

module.exports = { patchAndroidGradleProperties };

if (require.main === module) {
  patchAndroidGradleProperties();
}
