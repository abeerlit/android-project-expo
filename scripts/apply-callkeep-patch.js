#!/usr/bin/env node
const { execSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
try {
  execSync("node scripts/apply-callkeep-patch.cjs", {
    cwd: root,
    stdio: "inherit"
  });
} catch {
  console.warn("[apply-callkeep-patch] failed — patch-package may still apply");
}
