#!/usr/bin/env node
/**
 * Copy vendored Kotlin + notification layouts from native-android/ into generated android/.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const NATIVE_MAIN = path.join(ROOT, "native-android", "main");
const ANDROID = path.join(ROOT, "android", "app", "src", "main");

function mergeBareColors() {
  const bareColors = path.join(NATIVE_MAIN, "res", "values", "colors.xml");
  const destColors = path.join(ANDROID, "res", "values", "colors.xml");
  if (!fs.existsSync(bareColors) || !fs.existsSync(destColors)) return;
  const bare = fs.readFileSync(bareColors, "utf8");
  let existing = fs.readFileSync(destColors, "utf8");
  const entries = bare.match(/<color[\s\S]*?\/>|<color[\s\S]*?<\/color>/g) || [];
  const added = [];
  for (const entry of entries) {
    const nameMatch = entry.match(/name="([^"]+)"/);
    if (!nameMatch) continue;
    if (existing.includes(`name="${nameMatch[1]}"`)) continue;
    added.push(`  ${entry.trim()}`);
  }
  if (added.length) {
    existing = existing.replace("</resources>", `${added.join("\n")}\n</resources>`);
    fs.writeFileSync(destColors, existing);
    console.log(`[copy-voxo-native] merged ${added.length} colors from bare`);
  }
}

function mergeBareStrings() {
  const bareStrings = path.join(NATIVE_MAIN, "res", "values", "strings.xml");
  const destStrings = path.join(ANDROID, "res", "values", "strings.xml");
  if (!fs.existsSync(bareStrings) || !fs.existsSync(destStrings)) return;
  const bare = fs.readFileSync(bareStrings, "utf8");
  let existing = fs.readFileSync(destStrings, "utf8");
  const entries = bare.match(/<string[\s\S]*?<\/string>/g) || [];
  const added = [];
  for (const entry of entries) {
    const nameMatch = entry.match(/name="([^"]+)"/);
    if (!nameMatch || nameMatch[1] === "app_name") continue;
    if (existing.includes(`name="${nameMatch[1]}"`)) continue;
    added.push(`  ${entry.trim()}`);
  }
  if (added.length) {
    existing = existing.replace("</resources>", `${added.join("\n")}\n</resources>`);
    fs.writeFileSync(destStrings, existing);
    console.log(`[copy-voxo-native] merged ${added.length} strings from bare`);
  }
}

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

function copyVoxoNativeAndroid() {
  if (!fs.existsSync(ANDROID)) {
    console.warn("[copy-voxo-native] skip — run expo prebuild first");
    process.exit(0);
  }

  const kotlinSrc = path.join(NATIVE_MAIN, "java", "co", "voxo", "android");
  const kotlinDest = path.join(ANDROID, "java", "co", "voxo", "android");
  copyDir(kotlinSrc, kotlinDest);
  console.log("[copy-voxo-native] Kotlin co.voxo.android");

  for (const resDir of [
    "layout",
    "drawable",
    "drawable-hdpi",
    "raw",
    "mipmap-mdpi",
    "mipmap-hdpi",
    "mipmap-xhdpi",
    "mipmap-xxhdpi",
    "mipmap-xxxhdpi",
    "mipmap-anydpi-v26"
  ]) {
    const src = path.join(NATIVE_MAIN, "res", resDir);
    if (fs.existsSync(src)) {
      copyDir(src, path.join(ANDROID, "res", resDir));
      console.log(`[copy-voxo-native] res/${resDir}`);
    }
  }

  const launcherBg = path.join(NATIVE_MAIN, "res", "values", "ic_launcher_background.xml");
  const launcherBgDest = path.join(ANDROID, "res", "values", "ic_launcher_background.xml");
  if (fs.existsSync(launcherBg)) {
    fs.mkdirSync(path.dirname(launcherBgDest), { recursive: true });
    fs.copyFileSync(launcherBg, launcherBgDest);
    console.log("[copy-voxo-native] res/values/ic_launcher_background.xml");
  }

  mergeBareStrings();
  mergeBareColors();

  for (const extra of ["xml/file_paths.xml"]) {
    const s = path.join(NATIVE_MAIN, "res", extra);
    const d = path.join(ANDROID, "res", extra);
    if (fs.existsSync(s)) {
      fs.mkdirSync(path.dirname(d), { recursive: true });
      fs.copyFileSync(s, d);
    }
  }

  const stylesBare = path.join(NATIVE_MAIN, "res", "values", "styles.xml");
  const destStyles = path.join(ANDROID, "res", "values", "styles.xml");
  if (fs.existsSync(stylesBare) && fs.existsSync(destStyles)) {
    const bareStyles = fs.readFileSync(stylesBare, "utf8");
    let existing = fs.readFileSync(destStyles, "utf8");
    const blocks = [];
    for (const name of ["AppTheme.Fullscreen", "AppTheme.Transparent"]) {
      if (existing.includes(`name="${name}"`)) continue;
      const block = extractStyleBlock(bareStyles, name);
      if (block) blocks.push(block);
    }
    if (blocks.length) {
      existing = existing.replace(
        "</resources>",
        `\n\n${blocks.join("\n\n")}\n</resources>`
      );
      fs.writeFileSync(destStyles, existing);
      console.log(
        `[copy-voxo-native] merged ${blocks.length} call activity theme(s) into styles.xml`
      );
    }
  }
}

/** Match a single <style> by exact name (avoid comment-prefix regex that pulls in AppTheme). */
function extractStyleBlock(xml, styleName) {
  const escaped = styleName.replace(/\./g, "\\.");
  const re = new RegExp(`<style\\s+name="${escaped}"[\\s\\S]*?</style>`, "m");
  return xml.match(re)?.[0]?.trim();
}

module.exports = { copyVoxoNativeAndroid };

if (require.main === module) {
  copyVoxoNativeAndroid();
}
