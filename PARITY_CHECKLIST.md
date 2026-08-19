# Android parity checklist (bare vs android-project-expo)

Use staging device + same API tenant as bare. Check when enabling each flag group.

## Shell (flags off)

- [ ] Dev client installs (`npm run android`)
- [ ] Metro 8082 loads bundle
- [ ] Login succeeds
- [ ] Bottom tabs visible (chat/meetings may be stubbed)

## Notifications (`EXPO_PUBLIC_NATIVE_NOTIFICATIONS=1`)

- [ ] FCM token registered
- [ ] Notifee channels: `voxo-notifications`, `voxo-sms-v2`, `incoming-calls-v2`
- [ ] Background push displays (non-call)
- [ ] Tap opens correct screen

## Telephony (`EXPO_PUBLIC_NATIVE_TELEPHONY=1`)

- [ ] Inbound full-screen / heads-up incoming
- [ ] Answer / decline from notification
- [ ] Outbound call + DTMF
- [ ] Ongoing call notification
- [ ] Killed-state incoming (matrix in device notes)

## Chat (`EXPO_PUBLIC_CHAT_NATIVE=1`)

- [ ] `npm run editor:build` before release build
- [ ] Sendbird threads load
- [ ] Send message + attachments
- [ ] Rich editor (Tentap)

## Meetings (`EXPO_PUBLIC_MEETINGS_NATIVE=1`)

Rebuild native after enabling: `npm run android:setup:clean` then `npm run android`.

- [ ] Meetings tab loads (not stub placeholder)
- [ ] Join Daily room
- [ ] Camera / mic
- [ ] Screen share (MediaProjection prompt when sharing — ongoing meeting FGS is `camera|microphone` only)
- [ ] Foreground service during meeting
- [ ] Leave meeting cleans up service

## CI / release

- [ ] `npm run android:setup:verify` on CI
- [ ] `voxo android build voxo` (EAS production AAB)
- [ ] Play internal track submit via `voxo android submit voxo`
