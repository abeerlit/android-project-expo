# Android native setup (android-project-expo)

## Prerequisites

- Node 20+
- Android Studio / SDK (compileSdk 36, minSdk 24)
- JDK 17

## One-time setup

```bash
cp .env.example .env
npm install
npm run android:setup:clean
```

`postinstall` runs `patch-package` and CallKeep patch (`apply-callkeep-patch.cjs`). No symlink step.

## Pipeline

1. **`expo prebuild --platform android`** — generates gitignored `android/`
2. **Config plugins** (`plugins/withVoxoAndroid.js`):
   - `withFirebaseAndroid` — `google-services.json`, Google Services Gradle plugin
   - `withAndroidManifestExtras` — permissions + FCM / CallKeep / Daily services when telephony flag is on
   - `withVoxoNativeAndroid` — copies Kotlin + layouts when native flags are on
3. **`scripts/android-native-postbuild.js`** — sync Firebase JSON from `native-resources/`, copy `native-android/main` into `android/`, merge `MainApplication.kt` from `native-android/reference/`
4. **`./gradlew assembleDebug`**

## Committed assets

| Path | Role |
|------|------|
| `src/` | Full app JavaScript (vendored from bare; Expo call/permission edits merged in) |
| `native-android/main/` | Kotlin + `res` templates injected on prebuild |
| `native-android/reference/MainApplication.kt` | Telephony/notifications merge source |
| `native-resources/google-services.json` | Firebase config copied into `android/app/` |
| `patches/` | npm patches (CallKeep, Daily, clipboard) |

## Firebase

Place config at `native-resources/google-services.json`.

Override: `GOOGLE_SERVICES_JSON=./path/to/google-services.json` in `.env`.

## Enabling native stacks

```bash
# Notifications only
EXPO_PUBLIC_NATIVE_NOTIFICATIONS=1

# Full telephony (implies notifications)
EXPO_PUBLIC_NATIVE_TELEPHONY=1

npm run android:setup:clean
```

## Optional sync from bare

When you intentionally pull fixes from legacy bare Android:

```bash
npm run vendor:sync-bare
```

Re-apply any Expo-specific edits in `src/` if needed (permissions, `SoftphoneProvider`, etc.).

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `src/` missing | Restore from git or run `npm run vendor:sync-bare` with `android-project` present |
| Gradle / Kotlin errors after flag change | `npm run android:setup:clean` |
| CallKeep build errors | `node scripts/apply-callkeep-patch.cjs` (runs on postinstall) |
| Metro resolves wrong `redux-saga` | Use android-project-expo Metro only on port 8082 |
| Debug APK won’t load Metro (USB) | Metro must be running on **8082**. `adb reverse tcp:8082 tcp:8082` alone is not enough — the dev client must open with the bundle URL. Run `npm run android:open` (or scan the QR from `npm run start:device`). Also map default port 8081: `adb reverse tcp:8081 tcp:8082` |
| Debug APK won’t load Metro (Wi‑Fi) | Phone and Mac on same LAN; open `http://<MAC_LAN_IP>:8082` from the Expo QR (no `adb reverse` needed) |

## Device verification

See [PARITY_CHECKLIST.md](./PARITY_CHECKLIST.md) and [ANDROID_VOIP_MATRIX.md](./ANDROID_VOIP_MATRIX.md).

After vendoring changes: `npm run start:device:fresh`, login, outbound call, incoming (foreground / background / killed).
