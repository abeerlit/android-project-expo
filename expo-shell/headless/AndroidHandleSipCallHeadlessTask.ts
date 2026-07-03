/**
 * Headless JS task for Android kill/background-state incoming calls.
 *
 * Runs when HandleSipCallHeadlessTask (native foreground service) receives
 * INBOUND_CALL or REJECT_CALL.
 *
 * ARCHITECTURE (mirrors voxo-mobile GlobalCallManager.androidIncomingCall):
 * 1. Register for Answer/Reject immediately (parallel with SIP setup)
 * 2. Establish SIP wake-up registration so the server delivers the INVITE
 * 3. Wait for the INVITE to arrive (SessionManager emits "incomingCall")
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
import {
  markAndroidPendingDecline,
  isAndroidPendingDecline,
  clearAndroidPendingDecline
} from "core/softphone/androidPendingDecline.ts";

const VoxoConnectNotifications = NativeModules.VoxoConnectAndroidNotifications;

const TAG = "[AndroidHandleSipCallHeadlessTask]";

const INVITE_WAIT_MS = 15000;
const LATE_INVITE_AFTER_DECLINE_MS = 8000;

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

function isRejectNotificationResult(result: string | null | undefined): boolean {
  return result === "REJECT" || result === "CANCEL";
}

function isInviteTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== "object") {
    return err instanceof Error && err.message === "INVITE_TIMEOUT";
  }
  const e = err as { message?: string; error?: string };
  return (
    e.message === "INVITE_TIMEOUT" ||
    e.error === "RECEIVE_INVITE_TIMEOUT" ||
    e.error === "INVITE_CANCELLED_EARLY"
  );
}

function dismissIncomingCallUi(callUuid: string): void {
  const appInForeground = AppState.currentState === "active";
  try {
    VoxoConnectNotifications?.reportIncomingCallCancelled?.(
      callUuid,
      appInForeground
    );
  } catch (err) {
    console.warn(`${TAG} reportIncomingCallCancelled failed:`, err);
  }
}

function endCallNotification(callUuid: string): void {
  const appInForeground = AppState.currentState === "active";
  try {
    VoxoConnectNotifications?.reportCallEnded?.(callUuid, appInForeground);
  } catch (err) {
    console.warn(`${TAG} reportCallEnded failed:`, err);
  }
}

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

async function tryDeclineSession(
  sessionManager: SessionManager,
  sessionId: string
): Promise<void> {
  try {
    await sessionManager.declineCall(sessionId);
  } catch (err) {
    console.warn(`${TAG} declineCall failed (may already be ended):`, err);
    try {
      await sessionManager.hangupCall(sessionId);
    } catch {
      // Ignore
    }
  }
}

async function waitForInviteAfterDecline(
  emitter: EventEmitter,
  callUuid: string,
  sessionManager: SessionManager,
  alreadyHandled: () => boolean
): Promise<void> {
  if (alreadyHandled()) {
    clearAndroidPendingDecline(callUuid);
    return;
  }
  console.log(
    `${TAG} User declined before INVITE; waiting up to ${LATE_INVITE_AFTER_DECLINE_MS}ms for late INVITE`
  );
  const lateInvite = await new Promise<string | null>((resolve) => {
    const onIncoming = (sessionId: string, callInfo: CallInfo) => {
      if (callInfo.callUuid && callInfo.callUuid !== callUuid) return;
      cleanup();
      resolve(sessionId);
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve(null);
    }, LATE_INVITE_AFTER_DECLINE_MS);
    const cleanup = () => {
      clearTimeout(timer);
      emitter.removeListener("incomingCall", onIncoming);
    };
    emitter.on("incomingCall", onIncoming);
  });

  if (lateInvite) {
    console.log(`${TAG} Late INVITE after decline — sending SIP reject for ${lateInvite}`);
    await tryDeclineSession(sessionManager, lateInvite);
  }
  clearAndroidPendingDecline(callUuid);
}

/**
 * Handle an inbound call in the headless task.
 */
async function handleInboundCall(
  callUuid: string,
  callerIp: string,
  callerName: string,
  callerNumber: string,
  _route: string | undefined
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

  let notificationResult: string | null = null;
  let notificationSettled = false;
  let lateInviteAutoDeclined = false;

  const notificationResultPromise =
    VoxoConnectNotifications?.getIncomingCallNotificationResult?.(callUuid) ??
    Promise.resolve("ERROR");

  notificationResultPromise
    .then((result: string) => {
      notificationResult = result;
      notificationSettled = true;
      if (isRejectNotificationResult(result)) {
        console.log(
          `${TAG} Early notification ${result} for ${callUuid} — dismissing UI immediately`
        );
        markAndroidPendingDecline(callUuid);
        dismissIncomingCallUi(callUuid);
      }
    })
    .catch((err: unknown) => {
      notificationSettled = true;
      notificationResult = "ERROR";
      console.error(`${TAG} notification result error:`, err);
    });

  const invitePromise = new Promise<string>((resolve) => {
    emitter.on("incomingCall", (sessionId: string, callInfo: CallInfo) => {
      console.log(`${TAG} SIP INVITE received, sessionId=${sessionId}`);
      if (isAndroidPendingDecline(callUuid)) {
        console.log(
          `${TAG} Auto-declining late INVITE for user-declined call ${callUuid}`
        );
        lateInviteAutoDeclined = true;
        void tryDeclineSession(sessionManager, sessionId).finally(() => {
          clearAndroidPendingDecline(callUuid);
          endCallNotification(callUuid);
        });
        return;
      }
      resolve(sessionId);
    });
  });

  const inviteTimeout = new Promise<string>((_, reject) =>
    setTimeout(() => reject(new Error("INVITE_TIMEOUT")), INVITE_WAIT_MS)
  );

  let sessionId: string;
  try {
    console.log(`${TAG} Establishing inbound session (parallel with notification listener)...`);
    await sessionManager.establishInboundSession(callUuid, callerIp);
    console.log(`${TAG} Wake-up registration complete, waiting for INVITE`);

    if (notificationSettled && isRejectNotificationResult(notificationResult)) {
      await waitForInviteAfterDecline(
        emitter,
        callUuid,
        sessionManager,
        () => lateInviteAutoDeclined
      );
      endCallNotification(callUuid);
      return;
    }

    sessionId = await Promise.race([invitePromise, inviteTimeout]);
    console.log(`${TAG} Got SIP session: ${sessionId}`);
  } catch (err: unknown) {
    if (notificationSettled && isRejectNotificationResult(notificationResult)) {
      console.log(
        `${TAG} SIP setup failed after user decline for ${callUuid}:`,
        err
      );
      await waitForInviteAfterDecline(
        emitter,
        callUuid,
        sessionManager,
        () => lateInviteAutoDeclined
      );
      endCallNotification(callUuid);
    } else if (isInviteTimeoutError(err)) {
      console.warn(`${TAG} SIP INVITE never arrived for ${callUuid}`);
      dismissIncomingCallUi(callUuid);
    } else {
      console.error(`${TAG} Error in handleInboundCall (SIP setup):`, err);
      if (notificationSettled && isRejectNotificationResult(notificationResult)) {
        dismissIncomingCallUi(callUuid);
      }
    }
    try {
      await SessionManager.resetInstance();
    } catch {
      // Ignore
    }
    return;
  }

  if (VoxoConnectNotifications?.reportSignallingEstablished) {
    const secondLineHint = sessionManager.hasActiveAnsweredCall();
    VoxoConnectNotifications.reportSignallingEstablished(
      callUuid,
      secondLineHint
    );
  }

  if (!notificationSettled) {
    console.log(`${TAG} Awaiting user action/remote end for ${callUuid}...`);
    let remoteEndedBeforeAction = false;
    await new Promise<void>((resolve) => {
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

      const resolveOnce = (remoteEnded: boolean) => {
        if (settled) return;
        settled = true;
        remoteEndedBeforeAction = remoteEnded;
        cleanup();
        resolve();
      };

      callEndedHandler = (endedCallId: string) => {
        if (endedCallId === sessionId) {
          console.log(
            `${TAG} Remote ended before user action (callEnded): ${endedCallId}`
          );
          resolveOnce(true);
        }
      };
      emitter.on("callEnded", callEndedHandler);

      callStateChangedHandler = (changedCallId: string, state: CallState) => {
        if (changedCallId === sessionId && state === CallState.ENDED) {
          console.log(
            `${TAG} Remote ended before user action (callStateChanged): ${changedCallId}`
          );
          resolveOnce(true);
        }
      };
      emitter.on("callStateChanged", callStateChangedHandler);

      notificationResultPromise
        .then((result: string) => {
          notificationResult = result;
          notificationSettled = true;
          resolveOnce(false);
        })
        .catch((notifyErr: unknown) => {
          console.error(`${TAG} Error getting notification result:`, notifyErr);
          notificationResult = "ERROR";
          notificationSettled = true;
          resolveOnce(false);
        });
    });

    if (remoteEndedBeforeAction) {
      dismissIncomingCallUi(callUuid);
      return;
    }
  }

  console.log(
    `${TAG} User action received: ${notificationResult} for ${callUuid}`
  );

  if (
    notificationResult === "ANSWER" ||
    notificationResult === "END_AND_ACCEPT"
  ) {
    if (notificationResult === "END_AND_ACCEPT") {
      const sessions = (global as { __headlessCallSessions?: Map<string, { sessionManager: SessionManager; sessionId: string }> })
        .__headlessCallSessions;
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

    if (VoxoConnectNotifications?.reportCallAnswered) {
      VoxoConnectNotifications.reportCallAnswered(callUuid, callerName);
    }

    const headlessGlobal = global as unknown as {
      __headlessCallSessions?: Map<
        string,
        { sessionManager: SessionManager; sessionId: string }
      >;
    };
    if (!headlessGlobal.__headlessCallSessions) {
      headlessGlobal.__headlessCallSessions = new Map();
    }
    headlessGlobal.__headlessCallSessions.set(callUuid, {
      sessionManager,
      sessionId
    });

    await new Promise<void>((resolve) => {
      let settled = false;
      let hangupSub: { remove: () => void } | null = null;
      const cleanupAndResolve = () => {
        if (settled) return;
        settled = true;
        try {
          (global as unknown as { __headlessCallSessions?: Map<string, unknown> })
            .__headlessCallSessions?.delete(callUuid);
        } catch {
          // Ignore
        }
        try {
          hangupSub?.remove();
        } catch {
          // Ignore
        }
        resolve();
      };

      const onHangupRequested = (data: { callUuid?: string }) => {
        if (data?.callUuid === callUuid) {
          console.log(
            `${TAG} Hang up requested from notification, sending SIP BYE for ${sessionId}`
          );
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
          if (changedCallId === sessionId && state === CallState.ENDED) {
            console.log(`${TAG} Call state ENDED: ${changedCallId}`);
            cleanupAndResolve();
          }
        }
      );
    });

    endCallNotification(callUuid);
  } else if (isRejectNotificationResult(notificationResult)) {
    console.log(`${TAG} Rejecting/cancelling SIP session ${sessionId}`);
    await tryDeclineSession(sessionManager, sessionId);
    clearAndroidPendingDecline(callUuid);
    endCallNotification(callUuid);
  } else {
    console.warn(
      `${TAG} Unknown notification result: ${notificationResult}, cleaning up`
    );
    await tryDeclineSession(sessionManager, sessionId);
    endCallNotification(callUuid);
  }
}

/**
 * Handle a reject flow initiated from the notification before the headless task
 * had a chance to establish SIP.
 */
async function handleRejectCall(
  callUuid: string,
  callerIp: string | undefined
): Promise<void> {
  console.log(`${TAG} handleRejectCall`, { callUuid, callerIp });

  markAndroidPendingDecline(callUuid);
  dismissIncomingCallUi(callUuid);

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
    const invitePromise = new Promise<string>((resolve) => {
      emitter.on("incomingCall", (sid: string) => resolve(sid));
    });

    const setupPromise = sessionManager
      .establishInboundSession(callUuid, callerIp)
      .then(() =>
        Promise.race([
          invitePromise,
          new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error("INVITE_TIMEOUT")), INVITE_WAIT_MS)
          )
        ])
      );

    const sessionId = await Promise.race([
      setupPromise,
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), LATE_INVITE_AFTER_DECLINE_MS)
      )
    ]);

    if (sessionId) {
      await tryDeclineSession(sessionManager, sessionId);
      console.log(`${TAG} SIP reject sent for ${callUuid}`);
    } else {
      console.warn(
        `${TAG} No INVITE for reject flow within timeout for ${callUuid}`
      );
    }
  } catch (err) {
    if (isInviteTimeoutError(err)) {
      console.warn(`${TAG} handleRejectCall: INVITE timeout for ${callUuid}`);
    } else {
      console.error(`${TAG} Error in handleRejectCall:`, err);
    }
  } finally {
    clearAndroidPendingDecline(callUuid);
    endCallNotification(callUuid);
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
      console.error(`${TAG} Missing callUuid or callerIp for inbound call`, {
        callUuid,
        callerIp
      });
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
