# Phase 0 spike — RN 0.76.9 vs bare 0.77.3

## Decision

**Expo SDK 52 + React Native 0.76.9** (aligned with `ios-project-expo`). Bare `android-project` remains on **0.77.3** until this shell is production-ready.

## Validated in spike

- Vendored `src/` and `native-android/` committed in android-project-expo (no symlink)
- `tsc --noEmit` against shared src with expo-shell stubs (flags off)
- `expo prebuild --platform android` + `assembleDebug` with flags off (no custom Kotlin required)
- Dev client entry: `index.js` → `DeferredEntry` / shared navigation

## Watch items (0.76 vs 0.77)

| Area | Notes |
|------|--------|
| Reanimated / Screens | Expo-pinned versions; use `npm run android:setup:clean` after upgrades |
| Gradle / Kotlin | `expo-build-properties`: compileSdk 36, kotlin 1.9.25 |
| Type-only breaks | Fix in shared `src` only when blocking typecheck; prefer minimal diffs |
| New Architecture | Disabled (`newArchEnabled: false`) |

## Escalation

If Phase 0–2 block on RN API removals, document here and consider SDK 53 + RN 0.77 as a follow-up epic (out of scope unless spike fails).

## Exit criteria (Phase 0)

- [x] `android-project-expo` scaffold
- [x] Vendored `src/` + Metro `watchFolders`
- [x] Prebuild + Gradle debug build (CI `android:setup:verify`)
- [ ] Device: login → tabs with all `EXPO_PUBLIC_*` flags `0` (manual on hardware)
