/**
 * Shared storage for pending SIP sessions (SlimSipClient/VoIP push flow).
 * Used by SoftphoneProvider to store sessions and by NativeIntegration to detect
 * when an answer should go through voipBridge.handleCallAnswer instead of SessionManager.
 *
 * This module exists to avoid circular imports: NativeIntegration needs to check
 * for pending sessions but cannot import from SoftphoneProvider.
 */
import { NativeModules, Platform, AppState } from "react-native";
import CallKeep from "react-native-callkeep";
import InCallManager from "react-native-incall-manager";
import { SipSession } from "./jssip/SipSession";
import { SlimSipClient } from "./jssip/SlimSipClient";
import { VoipBridge } from "./VoipBridge";

const pendingSipSessions = new Map<string, SipSession>();
const pendingSipClients = new Map<string, SlimSipClient>();

function dismissCallAndStopRingtone(callUuid: string): void {
  try {
    InCallManager.stopRingtone();
    InCallManager.stopRingback();
    InCallManager.stop(); // Fully stop audio session; prevents lingering ringtone on next call
    CallKeep.reportEndCallWithUUID(callUuid, 2);
    // Android: explicitly notify native to dismiss ongoing notification when remote hung up.
    // Ensures the notification is cleared even if updateCallState path has timing issues.
    if (Platform.OS === "android") {
      const Notifications = NativeModules.VoxoConnectAndroidNotifications;
      const appInForeground = AppState.currentState === "active";
      Notifications?.reportCallEnded?.(callUuid, appInForeground);
      Notifications?.dismissOngoingCallNotification?.();
    }
    VoipBridge.getInstance().handleCallEnd(callUuid);
  } catch (e: unknown) {
    console.error(
      `📞 [SP] Failed to dismiss call/stop ringtone:`,
      (e as Error)?.message
    );
  }
}

export function storeSipSession(
  callUuid: string,
  session: SipSession,
  client: SlimSipClient
): void {
  console.log(`🔵 [SoftphoneProvider] Storing SIP session for ${callUuid}`);
  pendingSipSessions.set(callUuid, session);
  pendingSipClients.set(callUuid, client);

  const handleSessionEnded = () => {
    console.warn(
      `📞 [SP] sessionEnded for ${callUuid} (remote hung up) — dismissing CallKit`
    );
    dismissCallAndStopRingtone(callUuid);
  };

  const handleSessionFailed = () => {
    console.warn(
      `📞 [SP] sessionFailed for ${callUuid} (caller hung up before answer) — stopping ringtone, dismissing CallKit`
    );
    dismissCallAndStopRingtone(callUuid);
  };

  if (!session.listenerCount || session.listenerCount("sessionEnded") === 0) {
    session.on("sessionEnded", handleSessionEnded);
  }
  if (!session.listenerCount || session.listenerCount("sessionFailed") === 0) {
    session.on("sessionFailed", handleSessionFailed);
  }
}

export function getSipSession(callUuid: string): SipSession | undefined {
  // Check global storage first (for killed state sessions created in NotificationManager)
  // @ts-ignore
  if (global.pendingSipSessions && global.pendingSipSessions.has(callUuid)) {
    // @ts-ignore
    return global.pendingSipSessions.get(callUuid);
  }
  // Fall back to local storage (for foreground sessions)
  return pendingSipSessions.get(callUuid);
}

/** Returns true if there is a pending SIP session for this call (SlimSipClient flow) */
export function hasPendingSipSession(callId: string): boolean {
  return !!getSipSession(callId);
}

export function removeSipSession(callUuid: string): void {
  console.log(`🔵 [SoftphoneProvider] Removing SIP session for ${callUuid}`);

  // Remove from local storage
  const client = pendingSipClients.get(callUuid);
  if (client) {
    client.dispose().catch(() => {});
  }
  pendingSipSessions.delete(callUuid);
  pendingSipClients.delete(callUuid);

  // Also remove from global storage (killed state sessions)
  // @ts-ignore
  if (global.pendingSipClients && global.pendingSipClients.has(callUuid)) {
    // @ts-ignore
    const globalClient = global.pendingSipClients.get(callUuid);
    if (globalClient) {
      globalClient.dispose().catch(() => {});
    }
    // @ts-ignore
    global.pendingSipClients.delete(callUuid);
  }
  // @ts-ignore
  if (global.pendingSipSessions) {
    // @ts-ignore
    global.pendingSipSessions.delete(callUuid);
  }
}
