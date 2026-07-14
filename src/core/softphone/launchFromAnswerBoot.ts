import { NativeModules, Platform } from "react-native";

/**
 * Android kill-state Answer, read SYNCHRONOUSLY at boot.
 *
 * When the user answers from the notification while the app is killed, native launches MainActivity
 * with LAUNCH_FROM_ANSWER. Everything else in this flow is async (promise-based native module +
 * SIP register/INVITE), which means by the time JS knows a call was answered, the navigator has
 * already mounted its initial route — Home — and the user watches Home flash before InCallScreen.
 *
 * This module reads the native bundle synchronously so it can be consulted during the first render
 * pass: `AuthenticatedStackNavigator` uses it to pick `initialRouteName`, and `SoftphoneProvider`
 * uses it to seed a CONNECTING placeholder call so InCallScreen has something to show immediately.
 * The read is non-destructive (native `peek`); the bundle is drained via `consumeLaunchFromAnswerIntent`
 * once the call is fully promoted (or abandoned).
 */
export type BootLaunchFromAnswer = {
  callUuid: string;
  callerName: string;
  callerNumber: string;
};

// `undefined` = not read yet, `null` = read, nothing pending.
let cached: BootLaunchFromAnswer | null | undefined;
let initialRouteTaken = false;

/** Memoized sync read. Safe to call during render. */
export function getBootLaunchFromAnswer(): BootLaunchFromAnswer | null {
  if (cached !== undefined) return cached;
  cached = null;

  if (Platform.OS !== "android") return cached;

  try {
    const Notifications = NativeModules.VoxoConnectAndroidNotifications as
      | { getLaunchFromAnswerIntentSync?: () => string | null }
      | undefined;
    const raw = Notifications?.getLaunchFromAnswerIntentSync?.();
    if (!raw) return cached;

    const parsed = JSON.parse(raw) as Partial<BootLaunchFromAnswer>;
    if (parsed?.callUuid) {
      cached = {
        callUuid: parsed.callUuid,
        callerName: parsed.callerName || "Unknown Caller",
        callerNumber: parsed.callerNumber || "Unknown"
      };
    }
  } catch (_e) {
    cached = null;
  }

  return cached;
}

/**
 * Same value, but only ever returns non-null once — so a later remount of the authenticated stack
 * (log out / log back in, hot reload) can't reopen InCallScreen for a call that is long gone.
 */
export function takeBootLaunchFromAnswerForInitialRoute(): BootLaunchFromAnswer | null {
  if (initialRouteTaken) return null;
  initialRouteTaken = true;
  return getBootLaunchFromAnswer();
}

/** Forget the boot value once the call has been promoted to a real session, or abandoned. */
export function clearBootLaunchFromAnswer(): void {
  cached = null;
  initialRouteTaken = true;
}
