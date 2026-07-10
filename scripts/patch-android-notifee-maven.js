#!/usr/bin/env node
/**
 * @notifee/react-native publishes app.notifee:core in android/libs (local Maven).
 * Expo/RN 0.76 root build.gradle does not pick up Notifee's runtime allprojects hook.
 */
const fs = require("fs");
const path = require("path");

const BUILD_GRADLE = path.join(__dirname, "..", "android", "build.gradle");
const MARKER = "@notifee/react-native/android/libs";

function patchAndroidNotifeeMaven() {
  if (!fs.existsSync(BUILD_GRADLE)) {
    console.warn("[patch-notifee-maven] skip — no android/build.gradle");
    return false;
  }

  let body = fs.readFileSync(BUILD_GRADLE, "utf8");
  if (body.includes(MARKER)) {
    console.log("[patch-notifee-maven] already configured");
    return true;
  }

  const block = `        maven {
            // @notifee/react-native — app.notifee:core (local AAR)
            url "$rootDir/../node_modules/${MARKER}"
        }
`;

  const anchor = "maven { url 'https://www.jitpack.io' }";
  if (!body.includes(anchor)) {
    const reposClose = body.indexOf("allprojects {");
    if (reposClose === -1) {
      console.warn("[patch-notifee-maven] could not find allprojects.repositories");
      return false;
    }
    const insertAt = body.indexOf("    }", body.indexOf("repositories {", reposClose));
    body =
      body.slice(0, insertAt) +
      block +
      body.slice(insertAt);
  } else {
    body = body.replace(anchor, `${block}${anchor}`);
  }

  fs.writeFileSync(BUILD_GRADLE, body);
  console.log("[patch-notifee-maven] added Notifee local Maven repository");
  return true;
}

module.exports = { patchAndroidNotifeeMaven };

if (require.main === module) {
  patchAndroidNotifeeMaven();
}
