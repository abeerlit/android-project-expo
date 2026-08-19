#!/usr/bin/env bash
# USB device: forward Metro (8082) and open the dev client with the correct bundle URL.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${EXPO_METRO_PORT:-8082}"
PKG="${ANDROID_PACKAGE:-co.voxo.android}"
SCHEME="exp+voxo-connect-android-expo"

if ! command -v adb >/dev/null 2>&1; then
  echo "adb not found in PATH"
  exit 1
fi

DEVICE="${ANDROID_SERIAL:-}"
if [[ -z "$DEVICE" ]]; then
  DEVICE="$(adb devices | awk 'NR>1 && $2=="device" { print $1; exit }')"
fi
if [[ -z "$DEVICE" ]]; then
  echo "No adb device connected (adb devices)"
  exit 1
fi

ADB=(adb -s "$DEVICE")
echo "[android-device-metro] device=$DEVICE port=$PORT"

# Dev launcher often probes localhost:8081 — map both to host Metro.
"${ADB[@]}" reverse "tcp:${PORT}" "tcp:${PORT}" 2>/dev/null || true
"${ADB[@]}" reverse tcp:8081 "tcp:${PORT}" 2>/dev/null || true
"${ADB[@]}" reverse --list

URL="http://127.0.0.1:${PORT}"
ENCODED_URL="$(node -e "console.log(encodeURIComponent(process.argv[1]))" "$URL")"
DEEP_LINK="${SCHEME}://expo-development-client/?url=${ENCODED_URL}"

echo "[android-device-metro] opening ${URL}"
"${ADB[@]}" shell am start -a android.intent.action.VIEW -d "$DEEP_LINK" "$PKG" 2>/dev/null \
  || "${ADB[@]}" shell am start -a android.intent.action.VIEW -d "$DEEP_LINK"

echo "[android-device-metro] Ensure Metro is running: npm run start:device"
