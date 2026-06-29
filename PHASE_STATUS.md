# Android Expo migration — phase status

| Phase | Scope | Status |
|-------|--------|--------|
| 0 | Spike: scaffold, vendored src, prebuild, flags off | Done (CI verify); device smoke manual |
| 1 | Expo shell, metro/babel, index.js, deps, patches | Done |
| 2 | withVoxoAndroid plugins, copy Kotlin, android:setup | Done |
| 3 | Notifications flag + FCM/Notifee | Scaffolded — device pass pending |
| 4 | Telephony flag + CallKeep + headless | Scaffolded — device pass pending |
| 5–6 | Chat + meetings flags | Scaffolded — device pass pending |
| 7 | CI workflow, parity docs, root README | Done |
| 8 | voxo-manager `android` tenant + EAS | Done |

Enable flags incrementally; run `npm run android:setup:clean` after each change.
