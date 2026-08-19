# VOXO Connect — Android Expo dev client

Expo SDK 52 / React Native 0.76.9 standalone app. Vendored JavaScript in [`src/`](src/) and Android native templates in [`native-android/`](native-android/). No symlink to [`android-project`](../android-project/) at install or build time.

## Quick start (flags off — login + tabs)

```bash
cd android-project-expo
cp .env.example .env
npm install
npm run android:setup:clean
npm run start:device
npm run android
```

Metro uses port **8082**.

## Native feature flags

Set in `.env` (see `.env.example`):

| Variable | When `1` |
|----------|----------|
| `EXPO_PUBLIC_NATIVE_NOTIFICATIONS` | Firebase, Notifee, FCM service |
| `EXPO_PUBLIC_NATIVE_TELEPHONY` | CallKeep, Kotlin notifications module, headless SIP |
| `EXPO_PUBLIC_CHAT_NATIVE` | Sendbird, Tentap editor |
| `EXPO_PUBLIC_MEETINGS_NATIVE` | Daily.co + foreground service |

After changing flags, run `npm run android:setup:clean`.

## Scripts

| Script | Purpose |
|--------|---------|
| `android:setup` | Prebuild (if needed) + copy Kotlin + `assembleDebug` |
| `android:setup:clean` | `expo prebuild --clean` + postbuild |
| `android:setup:verify` | CI: full setup + Gradle debug APK |
| `editor:build` | Tentap chat editor (`src/features/chat/editor`) |
| `vendor:sync-bare` | Optional manual pull from `android-project` into `src/` + `native-android/` |

## Docs

- [ANDROID_SETUP.md](./ANDROID_SETUP.md) — permissions, Firebase, native copy pipeline
- [PHASE0_SPIKE.md](./PHASE0_SPIKE.md) — RN 0.76 vs bare 0.77 notes
- [MIGRATION_DEPS.md](./MIGRATION_DEPS.md) — dependency alignment
- [PARITY_CHECKLIST.md](./PARITY_CHECKLIST.md) — device sign-off vs bare

## White-label

Use [`voxo-manager`](../voxo-manager/): `voxo android build <tenant>`, `voxo android submit <tenant>`.
