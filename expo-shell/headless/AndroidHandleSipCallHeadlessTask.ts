/**
 * Headless JS task for Android kill/background-state incoming calls.
 *
 * Runs when HandleSipCallHeadlessTask (native foreground service) receives
 * INBOUND_CALL or REJECT_CALL.
 *
 * ARCHITECTURE (mirrors voxo-mobile GlobalCallManager.androidIncomingCall):
 * 1. Establish SIP wake-up registration so the server delivers the INVITE
 * 2. Wait for the INVITE to arrive (SessionManager emits "incomingCall")
 * 3. Call VoxoConnectAndroidNotifications.getIncomingCallNotificationResult()
 *    — a native Promise that BLOCKS until the user taps Answer/Reject
 * 4. Answer or reject the same SIP session that received the INVITE
 * 5. If answered, keep the task alive until the call completes
 */
import { NativeModules, DeviceEventEmitter, AppState } from "react-native";
import { store, rehydratePromise } from "store/global-store.ts";
import { SessionManager } from "core/softphone/SessionManager.ts";
import { EventEmitter } from "events";
import { CallState } from "core/softphone/types.ts";
import type { SipConfig, CallInfo } from "core/softphone/types.ts";
import {
  dismissStaleAndroidVoipCall,
  shouldSkipStaleVoipPush
} from "core/notifications/voipPushStaleCheck.ts";

const VoxoConnectNotifications = NativeModules.VoxoConnectAndroidNotifications;

const TAG = "[AndroidHandleSipCallHeadlessTask]";

type HeadlessPayload = {
  action?: string;
  direction?: string;
  callId?: string;
  callUuid?: string;
  callerNumber?: string;
  callerName?: string;
  route?: string;
  ip?: string;
  payload_callUuid?: string;
  payload_callerName?: string;
  payload_callerNumber?: string;
  payload_callId?: string;
  payload_ip?: string;
  payload_route?: string;
  [key: string]: unknown;
};

/** Wait for store rehydration (with timeout) so we can read user/SIP config in kill state. */
async function getSipConfigAfterRehydrate(): Promise<SipConfig | null> {
  try {
    await Promise.race([
      rehydratePromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Rehydrate timeout")), 5000)
      )
    ]);
  } catch {
    console.warn(`${TAG} Store rehydrate timeout or error`);
    return null;
  }
  const state = store.getState() as {
    userReducer?: {
      user?: { peerName?: string; peerSecret?: string; extName?: string };
    };
  };
  const user = state?.userReducer?.user;
  if (!user?.peerName || !user?.peerSecret) {
    console.warn(`${TAG} No SIP user in store, cannot establish SIP session`);
    return null;
  }
  return {
    displayName: user.extName || "User",
    user: user.peerName,
    password: user.peerSecret,
    domain: "dev-sip.voxo.co",
    uri: "wss://api.voxo.co/webrtc",
    iceServers: [
      {
        urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"]
      }
    ],
    useAudio: true,
    useVideo: false,
    useRinging: true,
    autoAnswer: false,
    autoReject: false
  };
}

/**
 * Handle an inbound call in the headless task.
 * This mirrors voxo-mobile's GlobalCallManager.androidIncomingCall():
 * - Establish SIP → wait for INVITE → wait for user action → answer/reject same session
 */
async function handleInboundCall(
  callUuid: string,
  callerIp: string,
  callerName: string,
  callerNumber: string,
  route: string | undefined
): Promise<void> {
  console.log(`${TAG} handleInboundCall`, {
    callUuid,
    callerIp,
    callerName,
    callerNumber
  });

  const config = await getSipConfigAfterRehydrate();
  if (!config) {
    console.error(`${TAG} Cannot handle inbound call - no SIP config`);
    return;
  }

  const emitter = new EventEmitter();
  const sessionManager = SessionManager.getInstance(emitter, config);

  let sipSessionId: string | null = null;

  // Wait for the INVITE to arrive after we register the wake-up UA
  const invitePromise = new Promise<string>((resolve) => {
    emitter.on(
      "incomingCall",
      (sessionId: string, _callInfo: CallInfo) => {
        console.log(
          `${TAG} SIP INVITE received, sessionId=${sessionId}`
        );
        sipSessionId = sessionId;
        resolve(sessionId);
      }
    );
  });

  // Timeout if INVITE never arrives
  const inviteTimeout = new Promise<string>((_, reject) =>
    setTimeout(
      () => reject(new Error("INVITE_TIMEOUT")),
      15000
    )
  );

  try {
    // Step 1: Register for Answer/Reject immediately — user may tap before SIP is ready.
    const notificationResultPromise =
      VoxoConnectNotifications?.getIncomingCallNotificationResult?.(callUuid) ??
      Promise.resolve("ERROR");

    // Step 2: Establish SIP wake-up registration and wait for INVITE (native already showed incoming UI).
    console.log(`${TAG} Establishing inbound session...`);
    await sessionManager.establishInboundSession(callUuid, callerIp);
    console.log(`${TAG} Wake-up registration complete, waiting for INVITE`);

    const sessionId = await Promise.race([invitePromise, inviteTimeout]);
    console.log(`${TAG} Got SIP session: ${sessionId}`);

    // Step 3: Notify native (second-line UI refresh; dedupe skips duplicate post on first call).
    if (VoxoConnectNotifications?.reportSignallingEstablished) {
      const secondLineHint = sessionManager.hasActiveAnsweredCall();
      VoxoConnectNotifications.reportSignallingEstablished(
        callUuid,
        secondLineHint
      );
    }

    // Step 4: Wait for either user action or remote hangup before answer.
    // In killed-state, if caller hangs up first and we only wait for user action,
    // the incoming notification can get stuck.
    console.log(`${TAG} Awaiting user action/remote end for ${callUuid}...`);
    let notificationResult: string = "ERROR";
    const waitResult = await new Promise<"USER_ACTION" | "REMOTE_ENDED">(
      (resolve) => {
        let settled = false;
        let callEndedHandler: ((endedCallId: string) => void) | null = null;
        let callStateChangedHandler:
          | ((changedCallId: string, state: CallState) => void)
          | null = null;

        const cleanup = () => {
          if (callEndedHandler) {
            emitter.removeListener("callEnded", callEndedHandler);
            callEndedHandler = null;
          }
          if (callStateChangedHandler) {
            emitter.removeListener("callStateChanged", callStateChangedHandler);
            callStateChangedHandler = null;
          }
        };

        const resolveOnce = (result: "USER_ACTION" | "REMOTE_ENDED") => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(result);
        };

        callEndedHandler = (endedCallId: string) => {
          if (endedCallId === sessionId) {
            console.log(
              `${TAG} Remote ended before user action (callEnded): ${endedCallId}`
            );
            resolveOnce("REMOTE_ENDED");
          }
        };
        emitter.on("callEnded", callEndedHandler);

        callStateChangedHandler = (
          changedCallId: string,
          state: CallState
        ) => {
          if (changedCallId === sessionId && state === CallState.ENDED) {
            console.log(
              `${TAG} Remote ended before user action (callStateChanged): ${changedCallId}`
            );
            resolveOnce("REMOTE_ENDED");
          }
        };
        emitter.on("callStateChanged", callStateChangedHandler);

        (async () => {
          try {
            notificationResult = await notificationResultPromise;
          } catch (err) {
            console.error(`${TAG} Error getting notification result:`, err);
            notificationResult = "ERROR";
          }
          resolveOnce("USER_ACTION");
        })();
      }
    );

    if (waitResult === "REMOTE_ENDED") {
      if (VoxoConnectNotifications?.reportIncomingCallCancelled) {
        VoxoConnectNotifications.reportIncomingCallCancelled(
          callUuid,
          AppState.currentState === "active"
        );
      }
      return;
    }

    console.log(
      `${TAG} User action received: ${notificationResult} for ${callUuid}`
    );

    // Step 6: Answer or reject the SIP session
    if (
      notificationResult === "ANSWER" ||
      notificationResult === "END_AND_ACCEPT"
    ) {
      if (notificationResult === "END_AND_ACCEPT") {
        const sessions = (global as any).__headlessCallSessions as
          | Map<string, { sessionManager: SessionManager; sessionId: string }>
          | undefined;
        if (sessions?.size) {
          for (const [u, entry] of [...sessions.entries()]) {
            if (u === callUuid) continue;
            try {
              await entry.sessionManager.hangupCall(entry.sessionId);
            } catch (hangErr) {
              console.warn(
                `${TAG} END_AND_ACCEPT: hangup other session failed`,
                hangErr
              );
            }
            sessions.delete(u);
          }
        }
      }
      console.log(`${TAG} Answering SIP session ${sessionId}`);
      await sessionManager.answerCall(sessionId);
      console.log(`${TAG} SIP call answered successfully`);

      // Swap incoming notification to ongoing (stops ringtone/vibration)
      if (VoxoConnectNotifications?.reportCallAnswered) {
        VoxoConnectNotifications.reportCallAnswered(callUuid, callerName);
      }

      // Store session in global so main app can mute/speaker when launched from killed state
      if (!(global as any).__headlessCallSessions) {
        (global as any).__headlessCallSessions = new Map();
      }
      (global as any).__headlessCallSessions.set(callUuid, {
        sessionManager,
        sessionId
      });

      // Step 7: Keep the headless task alive until the call ends
      await new Promise<void>((resolve) => {
        let settled = false;
        let hangupSub: { remove: () => void } | null = null;
        const cleanupAndResolve = () => {
          if (settled) return;
          settled = true;
          try {
            (global as any).__headlessCallSessions?.delete(callUuid);
          } catch {
            // Ignore cleanup errors
          }
          try {
            hangupSub?.remove();
          } catch {
            // Ignore listener cleanup errors
          }
          resolve();
        };

        const onHangupRequested = (data: { callUuid?: string }) => {
          if (data?.callUuid === callUuid) {
            console.log(`${TAG} Hang up requested from notification, sending SIP BYE for ${sessionId}`);
            sessionManager
              .hangupCall(sessionId)
              .then(() => cleanupAndResolve())
              .catch(() => cleanupAndResolve());
          }
        };
        hangupSub = DeviceEventEmitter.addListener(
          "HeadlessHangupRequested",
          onHangupRequested
        );

        emitter.on("callEnded", (endedCallId: string) => {
          if (endedCallId === sessionId) {
            console.log(`${TAG} Call ended: ${endedCallId}`);
            cleanupAndResolve();
          }
        });

        emitter.on(
          "callStateChanged",
          (changedCallId: string, state: CallState) => {
            if (
              changedCallId === sessionId &&
              state === CallState.ENDED
            ) {
              console.log(`${TAG} Call state ENDED: ${changedCallId}`);
              cleanupAndResolve();
            }
          }
        );
      });

      // Dismiss notification; only stop headless service when app not in foreground
      if (VoxoConnectNotifications?.reportCallEnded) {
        VoxoConnectNotifications.reportCallEnded(callUuid, AppState.currentState === "active");
      }
    } else if (
      notificationResult === "REJECT" ||
      notificationResult === "CANCEL"
    ) {
      console.log(
        `${TAG} Rejecting/cancelling SIP session ${sessionId}`
      );
      try {
        await sessionManager.declineCall(sessionId);
      } catch (err) {
        console.warn(`${TAG} Error declining call (may already be ended):`, err);
      }
      if (VoxoConnectNotifications?.reportCallEnded) {
        VoxoConnectNotifications.reportCallEnded(callUuid, AppState.currentState === "active");
      }
    } else {
      console.warn(
        `${TAG} Unknown notification result: ${notificationResult}, cleaning up`
      );
      try {
        await sessionManager.declineCall(sessionId);
      } catch {
        // Ignore
      }
      if (VoxoConnectNotifications?.reportCallEnded) {
        VoxoConnectNotifications.reportCallEnded(callUuid, AppState.currentState === "active");
      }
    }
  } catch (err: any) {
    if (err?.message === "INVITE_TIMEOUT") {
      console.warn(`${TAG} SIP INVITE never arrived for ${callUuid}`);
      // Report call cancelled so notification is dismissed
      if (VoxoConnectNotifications?.reportIncomingCallCancelled) {
        VoxoConnectNotifications.reportIncomingCallCancelled(callUuid, AppState.currentState === "active");
      }
    } else {
      console.error(`${TAG} Error in handleInboundCall:`, err);
    }
    try {
      await SessionManager.resetInstance();
    } catch {
      // Ignore reset errors (headless-only failure path)
    }
  }
  // On success we do not dispose/reset here: SessionManager singleton may be shared with main
  // SippyCup after answer (reportCallAnswered); teardown runs on call end inside SessionManager.
}

/**
 * Handle a reject flow initiated from the notification before the headless task
 * had a chance to establish SIP. We still need to send a SIP reject so the
 * server knows the call was declined.
 */
async function handleRejectCall(
  callUuid: string,
  callerIp: string | undefined
): Promise<void> {
  console.log(`${TAG} handleRejectCall`, { callUuid, callerIp });

  if (!callerIp) {
    console.warn(`${TAG} No callerIp for reject, cannot send SIP reject`);
    return;
  }

  const config = await getSipConfigAfterRehydrate();
  if (!config) {
    console.warn(`${TAG} No SIP config for reject`);
    return;
  }

  const emitter = new EventEmitter();
  const sessionManager = SessionManager.getInstance(emitter, config);

  try {
    // Register and wait for INVITE, then reject it
    await sessionManager.establishInboundSession(callUuid, callerIp);

    const sessionId = await new Promise<string>((resolve) => {
      emitter.on("incomingCall", (sid: string) => resolve(sid));
      setTimeout(() => resolve(""), 10000);
    });

    if (sessionId) {
      await sessionManager.declineCall(sessionId);
      console.log(`${TAG} SIP reject sent for ${callUuid}`);
    }
  } catch (err) {
    console.error(`${TAG} Error in handleRejectCall:`, err);
  } finally {
    try {
      await SessionManager.resetInstance();
    } catch {
      // Ignore
    }
  }
}

export default async (data: HeadlessPayload): Promise<void> => {
  if (!data) {
    console.warn(`${TAG} No data received`);
    return;
  }

  const callUuid = (data.callUuid ||
    data.payload_callUuid ||
    (data as Record<string, unknown>).callUuid) as string;
  const callerName =
    data.callerName || data.payload_callerName || "Unknown Caller";
  const callerNumber =
    data.callerNumber || data.payload_callerNumber || "Unknown Number";
  const callerIp = (data.ip ||
    data.payload_ip ||
    (data as Record<string, unknown>).ip) as string | undefined;
  const route = (data.route || data.payload_route) as string | undefined;

  console.log(`${TAG} Received task`, {
    action: data.action,
    direction: data.direction,
    callUuid,
    callerIp
  });

  if (data.action === "reject" || data.direction === "reject") {
    await handleRejectCall(callUuid, callerIp);
    return;
  }

  if (data.direction === "inbound" || data.action === "answer") {
    if (!callUuid || !callerIp) {
      console.error(
        `${TAG} Missing callUuid or callerIp for inbound call`,
        { callUuid, callerIp }
      );
      return;
    }

    if (
      shouldSkipStaleVoipPush(
        data as Record<string, unknown>,
        callUuid,
        "headless.handleInboundCall"
      )
    ) {
      dismissStaleAndroidVoipCall(callUuid, {
        callUuid,
        callerName: String(callerName),
        callerNumber: String(callerNumber),
        payload: data as Record<string, unknown>
      });
      return;
    }

    await handleInboundCall(
      callUuid,
      callerIp,
      String(callerName),
      String(callerNumber),
      route
    );
    return;
  }

  if (data.direction === "outbound") {
    console.log(`${TAG} Outbound call - handled by app`);
    return;
  }

  console.warn(`${TAG} Unknown action/direction`, {
    action: data.action,
    direction: data.direction
  });
};
