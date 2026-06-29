#!/usr/bin/env node
/**
 * Copies tenant APP_ICON into src/assets/branding/app-icon.png for in-app UI (login, etc.).
 * Reads APP_ICON from process.env or .env in project root.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "src", "assets", "branding", "app-icon.png");
const DEFAULT_ICON = path.join(ROOT, "branding", "voxo", "icon.png");

function loadDotEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = val;
  }
}

function resolveIconPath() {
  const rel = process.env.APP_ICON?.trim();
  if (rel) {
    const abs = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
    if (fs.existsSync(abs)) return abs;
    console.warn(`[ui-branding] APP_ICON not found: ${abs}`);
  }
  return DEFAULT_ICON;
}

function main() {
  loadDotEnv();
  const src = resolveIconPath();
  if (!fs.existsSync(src)) {
    console.warn(`[ui-branding] skip — no icon at ${src}`);
    return;
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.copyFileSync(src, OUT);
  console.log(`[ui-branding] ${path.relative(ROOT, src)} → ${path.relative(ROOT, OUT)}`);
}

main();
