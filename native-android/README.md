# Vendored Android native templates

Kotlin sources, notification layouts, and `res` assets copied from bare `android-project`. Applied into generated `android/` on prebuild via `scripts/copy-voxo-native-android.js`.

- `main/` — injected into `android/app/src/main/` when telephony or notifications flags are on
- `reference/MainApplication.kt` — source for `scripts/merge-main-application.js`

Optional refresh from bare: `npm run vendor:sync-bare` (manual only).
