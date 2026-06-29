# Migration dependencies — bare Android → android-project-expo

Aligned with [`ios-project-expo/package.json`](../ios-project-expo/package.json) where possible; versions match [`android-project/package.json`](../android-project/package.json) for native-critical packages.

| Package | Bare | Expo shell |
|---------|------|------------|
| react-native | 0.77.3 | **0.76.9** (Expo 52) |
| expo | — | ~52.0.0 |
| @react-native-firebase/app | ^19.1.1 | ^19.1.1 |
| @notifee/react-native | ^9.1.8 | ^9.1.8 |
| react-native-callkeep | ^4.3.16 | ^4.3.16 + patch |
| @daily-co/react-native-daily-js | ^0.84.1 | ^0.84.1 + patch |
| @react-native-clipboard/clipboard | ^1.15.0 | ^1.15.0 + patch |

Patches copied to `patches/` from bare `android-project/patches/`.

**Not in Expo shell (iOS-only):** `react-native-voip-push-notification`, `@react-native-community/push-notification-ios`.

**Stubbed in dev shell** (Metro aliases until `EXPO_PUBLIC_NATIVE_FULL=1` + rebuild): `react-native-email-link`, `react-native-confirmation-code-field`, `react-native-skeleton-placeholder`, `react-native-system-navigation-bar`, and other entries in `expo-shell/unlinkedNativeModules.js`.

**Android-only native:** Kotlin under `co.voxo.android` from vendored `native-android/main/`, injected at prebuild when notification/telephony flags are on.
