#!/usr/bin/env node
/**
 * Copy SSO (and optional API) keys from ios-project-expo/.env into android-project-expo/.env
 */
const fs = require("fs");
const path = require("path");

const KEYS = [
  "API_URL",
  "GOOGLE_CLIENT_ID",
  "AZURE_CLIENT_ID",
  "SEND_BIRD_APP_ID",
  "SEND_BIRD_APP_TOKEN",
  "GIPHY_ANDROID_KEY",
  "SENTRY_DSN"
];

const EXPO_FLAG_KEYS = [
  "EXPO_PUBLIC_NATIVE_TELEPHONY",
  "EXPO_PUBLIC_NATIVE_NOTIFICATIONS",
  "EXPO_PUBLIC_CHAT_NATIVE",
  "EXPO_PUBLIC_MEETINGS_NATIVE"
];

const root = path.join(__dirname, "..");
const iosEnv = path.join(root, "..", "ios-project-expo", ".env");
const androidEnv = path.join(root, ".env");

function parseEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

function main() {
  const ios = parseEnv(iosEnv);
  const android = parseEnv(androidEnv);
  let changed = 0;
  for (const key of [...KEYS, ...EXPO_FLAG_KEYS]) {
    if (ios[key]) {
      android[key] = ios[key];
      changed++;
    }
  }
  const lines = fs.readFileSync(androidEnv, "utf8").split("\n");
  const out = lines.map((line) => {
    const t = line.trim();
    if (!t || t.startsWith("#")) return line;
    const i = t.indexOf("=");
    if (i === -1) return line;
    const key = t.slice(0, i).trim();
    if (android[key] !== undefined && ios[key]) {
      return `${key}=${android[key]}`;
    }
    return line;
  });
  fs.writeFileSync(androidEnv, out.join("\n"));
  console.log(`[sync-env] updated ${changed} keys in .env from ios-project-expo`);
}

main();
