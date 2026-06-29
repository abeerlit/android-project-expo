#!/usr/bin/env node
/**
 * Verify a release AAB before Play Console upload:
 * - arm64-v8a ELF LOAD segment alignment >= 16 KB (0x4000)
 * - Foreground service permissions / types present (for Console declaration)
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const MIN_ALIGN = 0x4000;

function parseElfAlign(soPath) {
  const data = fs.readFileSync(soPath);
  if (data.slice(0, 4).toString() !== "\x7fELF" || data[4] !== 2) {
    return null;
  }
  return data.readBigUInt64LE(48);
}

function verify16Kb(aabPath, extractDir) {
  fs.mkdirSync(extractDir, { recursive: true });
  execSync(`unzip -q -o "${aabPath}" -d "${extractDir}"`);

  const bad = [];
  let ok = 0;
  for (const dirpath of walk(extractDir)) {
    for (const name of fs.readdirSync(dirpath)) {
      if (!name.endsWith(".so")) continue;
      const full = path.join(dirpath, name);
      if (!full.includes(`${path.sep}arm64-v8a${path.sep}`)) continue;
      const align = parseElfAlign(full);
      if (align == null) continue;
      const rel = full.slice(extractDir.length + 1);
      if (Number(align) < MIN_ALIGN) {
        bad.push({ rel, align: `0x${align.toString(16)}` });
      } else {
        ok += 1;
      }
    }
  }
  return { ok, bad };
}

function* walk(root) {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    yield dir;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) stack.push(full);
    }
  }
}

function auditForegroundServices(manifestPath) {
  if (!fs.existsSync(manifestPath)) {
    return { permissions: [], serviceTypes: [] };
  }
  const xml = fs.readFileSync(manifestPath, "utf8");
  const permissions = [
    ...xml.matchAll(/uses-permission[^>]+android:name="(android\.permission\.FOREGROUND_SERVICE[^"]+)"/g)
  ].map((m) => m[1]);
  const serviceTypes = [
    ...xml.matchAll(/foregroundServiceType="([^"]+)"/g)
  ].flatMap((m) => m[1].split("|"));
  return {
    permissions: [...new Set(permissions)].sort(),
    serviceTypes: [...new Set(serviceTypes)].sort()
  };
}

function printPlayConsoleFgsGuide(audit) {
  console.log("\n[verify-aab] Play Console — App content → Foreground service permissions");
  console.log("Declare each type your app uses (required before production save):");
  const typeMap = {
    phoneCall: "Phone call — VoIP/SIP incoming & ongoing calls (CallKeep, HandleSipCallHeadlessTask, VoxoCallService)",
    microphone: "Microphone — active call audio",
    camera: "Camera — Daily meetings video",
    mediaProjection: "Media projection — screen share (Daily / WebRTC MediaProjectionService)",
    remoteMessaging: "Remote messaging — FCM push handling",
    dataSync: "Data sync — Notifee notification foreground work (if listed)",
    shortService: "Short service — Notifee ForegroundService (Android 15+)"
  };
  for (const t of audit.serviceTypes) {
    console.log(`  • ${t}: ${typeMap[t] ?? "see merged manifest"}`);
  }
  if (audit.permissions.includes("android.permission.FOREGROUND_SERVICE_DATA_SYNC")) {
    console.log("  • dataSync permission is in manifest — declare Data sync in Play Console");
  }
  console.log(
    "\n[verify-aab] This is a Play Console form, not fixable inside the AAB. " +
      "Complete the declaration, then upload this AAB."
  );
}

function main() {
  const aab =
    process.argv[2] ||
    path.join(
      __dirname,
      "..",
      "android",
      "app",
      "build",
      "outputs",
      "bundle",
      "release",
      "app-release.aab"
    );

  if (!fs.existsSync(aab)) {
    console.error(`[verify-aab] AAB not found: ${aab}`);
    process.exit(1);
  }

  const extractDir = path.join(require("os").tmpdir(), `voxo-aab-verify-${Date.now()}`);
  const { ok, bad } = verify16Kb(aab, extractDir);
  fs.rmSync(extractDir, { recursive: true, force: true });

  console.log(`[verify-aab] ${aab}`);
  console.log(`[verify-aab] arm64-v8a libs ok=${ok} bad=${bad.length}`);
  if (bad.length) {
    for (const { rel, align } of bad) {
      console.error(`  BAD ${rel} align=${align}`);
    }
    process.exit(1);
  }

  const manifest = path.join(
    __dirname,
    "..",
    "android",
    "app",
    "build",
    "intermediates",
    "merged_manifest",
    "release",
    "processReleaseMainManifest",
    "AndroidManifest.xml"
  );
  const audit = auditForegroundServices(manifest);
  console.log("[verify-aab] FGS permissions:", audit.permissions.join(", ") || "(none)");
  console.log("[verify-aab] FGS service types:", audit.serviceTypes.join(", ") || "(none)");
  printPlayConsoleFgsGuide(audit);
  console.log("\n[verify-aab] 16 KB check PASSED");
}

main();
