# Android VoIP / telephony test matrix

Enable `EXPO_PUBLIC_NATIVE_TELEPHONY=1` and `EXPO_PUBLIC_NATIVE_NOTIFICATIONS=1`, then `npm run android:setup:clean`.

| Scenario | Expected |
|----------|----------|
| App foreground, inbound SIP | SoftphoneProvider + CallKeep / notification UI |
| App background, FCM `incoming_call_notification` | JS `setBackgroundMessageHandler` → VoipBridge or `startInboundCallHeadlessTask` |
| App killed, FCM `incoming_call_notification` | `VoxoConnectFirebaseService` → `HandleSipCallHeadlessTask` → headless JS |
| Answer from notification | `AnswerTrampolineActivity` → active call |
| Decline | Notification dismissed, no ghost call |
| Outbound dial | Ongoing call notification + audio route |
| DTMF | Sidetone module active |
| End call | Ongoing notification cleared |

## Background vs killed

- **Killed (no React context):** Native `VoxoConnectFirebaseService` starts the SIP foreground service; `index.js` must register `AndroidHandleSipCallHeadlessTask` (always on Android).
- **Background (React alive):** Native FCM service intentionally skips; Expo uses `expo-shell/androidFcmBackgroundHandler.ts` (same logic as bare `index.js`), not `incoming_call` / `handleIncomingCallNotification`.

After changing manifest plugins, rebuild: `npm run android:setup:clean` or `npm run android`. JS handler changes need Metro reload (`npm run start:device:fresh`).

Native: Kotlin under `co.voxo.android` (copied from bare), CallKeep patch, `HandleSipCallHeadlessTask`.
