import React, { useState, useCallback, useRef, useEffect } from "react";
import { useSelector } from "react-redux";
import {
  Platform,
  Alert,
  Linking,
  AppState,
  NativeModules,
  InteractionManager,
  DeviceEventEmitter
} from "react-native";
import { toast } from "@backpackapp-io/react-native-toast";
import { Logger } from "shared/utils/Logger.ts";
import { SippyCup } from "core/softphone/SippyCup.ts";
import { SessionManager } from "core/softphone/SessionManager.ts";
import { ensureAndroidCallPermissions } from "core/permissions/android-call-permissions.ts";
import {
  SoftphoneContext,
  SoftphoneContextState,
  ContextCallInfo
} from "../../../expo-shell/voxoSoftphoneContext.ts";
import {
  CallInfo,
  CallOptions,
  SipConfig,
  CallState,
  CallDirection,
  RemoteParty
} from "core/softphone/types.ts";
import { State } from "store/types.ts";
import { VoipBridge } from "core/softphone/VoipBridge.ts";
import { getAndClearLaunchIntent } from "core/LaunchIntent.ts";
import { v4 as uuidv4 } from "uuid";
import Geolocation from "@react-native-community/geolocation";
import { useNavigation } from "@react-navigation/native";
import PendingCallManager from "core/notifications/PendingCallManager.ts";
import { USE_SLIMSIP_INBOUND_ONLY } from "core/config/callApproach.ts";
import { SlimSipClient, SipClientSettings } from "core/softphone/jssip/SlimSipClient";
import { SipSession } from "core/softphone/jssip/SipSession";
import { playDtmfSidetoneAndroid } from "core/softphone/dtmfSidetoneAndroid.ts";
import {
  getSipSession,
  hasPendingSipSession,
  removeSipSession,
  storeSipSession
} from "core/softphone/pendingSipSessions.ts";
import { store } from "store/global-store.ts";
import CallKeep from "react-native-callkeep";
import InCallManager from "react-native-incall-manager";
import { getCurrentRoute } from "core/navigation/utils/Ref.ts";
import { Routes } from "core/navigation/types/types.ts";
import { hasActiveCall, setCallActive } from "core/callState.ts";
import { isRegistererTerminatedError } from "core/softphone/sipRegistererErrors.ts";
import {
  getAndroidPermissionPromptsComplete,
  subscribeAndroidPermissionPromptGate
} from "core/permissions/android-permission-prompt-gate.ts";
import { androidCallFlowError, androidCallFlowLog } from "core/softphone/androidCallFlowLog.ts";
import { applyCallSpeakerAndroid } from "core/softphone/androidCallAudio.ts";
import {
  dismissStaleAndroidVoipCall,
  shouldSkipStaleVoipPush
} from "core/notifications/voipPushStaleCheck.ts";

const logger = new Logger("SoftphoneProvider: ");
const OUTBOUND_INIT_TIMEOUT_MS = 12000;
const OUTBOUND_RETRYABLE_SETUP_TIMEOUT_MS = 15000;
const DIALING_WATCHDOG_TIMEOUT_MS = 20000;
const RESUME_REINIT_IDLE_MS = 90000;

/** User cancelled outbound setup (End during “Dialing…”); not a SIP failure. */
class OutboundDialCancelled extends Error {
  constructor() {
    super("OUTBOUND_DIAL_CANCELLED");
    this.name = "OutboundDialCancelled";
  }
}

function isOutboundDialCancelled(e: unknown): boolean {
  return (
    e instanceof OutboundDialCancelled ||
    (e instanceof Error && e.message === "OUTBOUND_DIAL_CANCELLED")
  );
}

export { getSipSession };

const getLiveCallCount = (calls: Record<string, ContextCallInfo>): number =>
  Object.values(calls).filter(
    (call) => call.state !== CallState.ENDED && call.state !== CallState.FAILED
  ).length;

const withTimeout = async <T,>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> => {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

/**
 * Get current location for emergency cal
 */
const getCurrentLocation = (): Promise<{
  latitude: number;
  longitude: number;
}> => {
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (position: any) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
      },
      (error: any) => {
        logger.error("Error getting location:", error);
        reject(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000
      }
    );
  });
};

/**
 * Safely read SIP header value from jssip request (handles different header formats)
 */
const getSipRequestHeaderValue = (
  request: any,
  headerName: string
): string | undefined => {
  if (!request) return undefined;

  if (typeof request.getHeader === "function") {
    const direct = request.getHeader(headerName);
    if (direct) return String(direct);
  }

  const headers = request.headers;
  if (!headers || typeof headers !== "object") return undefined;

  const targetHeader = headerName.toLowerCase();
  const matchedKey = Object.keys(headers).find(
    (key) => key.toLowerCase() === targetHeader
  );
  if (!matchedKey) return undefined;

  const headerValue = headers[matchedKey];
  if (Array.isArray(headerValue) && headerValue.length > 0) {
    const first = headerValue[0] as any;
    if (typeof first === "string") return first;
    if (typeof first?.raw === "string") return first.raw;
  }

  if (typeof headerValue === "string") return headerValue;
  if (typeof (headerValue as any)?.raw === "string")
    return (headerValue as any).raw;

  return undefined;
};

/**
 * Extract server call ID from SipSession (VoIP/SlimSipClient).
 * Reads Xcid from rtcSession._request; fallback to SIP Call-ID.
 */
const extractServerCallIdFromSipSession = (
  sipSession?: SipSession
): string | undefined => {
  const sipAny = sipSession as any;
  const rtcSession = sipAny?.rtcSession;
  const request = rtcSession?._request;

  const xcid =
    getSipRequestHeaderValue(request, "Xcid") ||
    getSipRequestHeaderValue(request, "X-Cid") ||
    getSipRequestHeaderValue(request, "XCID");
  if (xcid) return xcid;

  return request?.call_id || rtcSession?._dialog?._id?.call_id;
};

/**
 * Resolve backend call ID for API operations.
 * Prefers SlimSip Xcid, then SessionManager INVITE XCID (managedSessionApiId), then context callId.
 */
const resolveBackendCallId = (
  call: ContextCallInfo | null | undefined,
  sipSession?: SipSession,
  managedSessionApiId?: string
): string | undefined => {
  const sessionDerivedId = extractServerCallIdFromSipSession(sipSession);
  if (sessionDerivedId) return sessionDerivedId;
  if (managedSessionApiId) return managedSessionApiId;
  if (!call) return undefined;
  const isPlaceholder =
    !!call.callId && !!call.sessionId && call.callId === call.sessionId;
  if (!isPlaceholder && call.callId) {
    return call.callId;
  }
  return call.callId;
};

type ConferenceMergeAttempt = {
  callId: string;
  mergeCallId: string;
  strategy: "primary" | "swapped";
};

/**
 * Build SipClientSettings for SlimSipClient from Redux auth/user.
 * Used for VoIP attended transfer (Add Person) child call.
 */
const buildSlimSipSettings = (
  callUuid: string,
  direction: "inbound" | "outbound"
): SipClientSettings | null => {
  const state = store.getState();
  const { authReducer, userReducer } = state as State;
  if (!authReducer.isLoggedIn || !userReducer.user) return null;
  return {
    routeOptions: { direction, callUuid },
    pcConfig: {
      bundlePolicy: "max-compat",
      iceServers: [
        {
          urls: [
            "stun:stun.l.google.com:19302",
            "stun:stun1.l.google.com:19302",
            "stun:stun2.l.google.com:19302",
            "stun:stun3.l.google.com:19302",
            "stun:stun4.l.google.com:19302"
          ]
        }
      ],
      iceTransportPolicy: "all"
    },
    token: authReducer.accessToken,
    sipUri: `sip:${userReducer.user.peerName}@dev-sip.voxo.co`,
    name: userReducer.user.extName || "User",
    wsUrl: "wss://api.voxo.co/webrtc",
    password: userReducer.user.peerSecret
  };
};

const buildConferenceMergeAttempts = (params: {
  activeCallId?: string;
  parentCallId?: string;
  childCallId?: string;
}): ConferenceMergeAttempt[] => {
  const { activeCallId, parentCallId, childCallId } = params;
  if (!activeCallId || !parentCallId || !childCallId) return [];
  if (parentCallId === childCallId) return [];

  const nonActiveCallId =
    activeCallId === parentCallId ? childCallId : parentCallId;

  if (!nonActiveCallId || nonActiveCallId === activeCallId) {
    return [];
  }

  return [
    {
      callId: nonActiveCallId,
      mergeCallId: activeCallId,
      strategy: "primary"
    },
    {
      callId: activeCallId,
      mergeCallId: nonActiveCallId,
      strategy: "swapped"
    }
  ];
};

const getErrorStatusCode = (error: unknown): number | undefined => {
  const anyError = error as any;
  const rawStatus =
    anyError?.statusCode ??
    anyError?.status ??
    anyError?.error?.statusCode ??
    anyError?.error?.status ??
    anyError?.response?.statusCode ??
    anyError?.response?.status ??
    anyError?.error?.response?.statusCode ??
    anyError?.error?.response?.status ??
    anyError?.cause?.statusCode ??
    anyError?.cause?.status ??
    anyError?.cause?.response?.statusCode ??
    anyError?.cause?.response?.status ??
    anyError?.code;
  const numericStatus = Number(rawStatus);
  return Number.isFinite(numericStatus) ? numericStatus : undefined;
};

const isRetriableConferenceMergeError = (error: unknown): boolean => {
  const statusCode = getErrorStatusCode(error);
  const anyError = error as any;
  const message = String(anyError?.message || "").toLowerCase();
  const nestedMessage = String(anyError?.error?.message || "").toLowerCase();
  const causeMessage = String(anyError?.cause?.message || "").toLowerCase();
  const name = String(anyError?.name || "").toLowerCase();
  const nestedName = String(anyError?.error?.name || "").toLowerCase();
  const errorText = [message, nestedMessage, causeMessage, name, nestedName].join(
    " "
  );

  return (
    statusCode === 500 ||
    errorText.includes("failed to merge") ||
    errorText.includes("internal server error") ||
    errorText.includes("unhandled error") ||
    errorText.includes("conference call")
  );
};

/** Map VoIP push UUID (or any alias) to the key used in `state.calls`. */
function resolveCallsRecordKey(
  calls: Record<string, ContextCallInfo>,
  id: string
): string | undefined {
  if (calls[id]) return id;
  for (const [key, c] of Object.entries(calls)) {
    if (c.callUuid === id) return key;
  }
  return undefined;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Some kill-state paths concatenate push UUID + SIP session id without a separator. */
function splitCompositeCallId(callId: string): {
  callUuid?: string;
  sipSessionId: string;
} {
  if (UUID_RE.test(callId)) {
    return { sipSessionId: callId };
  }
  if (callId.length > 36) {
    const first = callId.slice(0, 36);
    const rest = callId.slice(36);
    if (UUID_RE.test(first) && UUID_RE.test(rest)) {
      return { callUuid: first, sipSessionId: rest };
    }
  }
  return { sipSessionId: callId };
}

function hasLiveCallsInState(
  calls: Record<string, ContextCallInfo>
): boolean {
  return Object.values(calls).some(
    (c) => c.state !== CallState.ENDED && c.state !== CallState.FAILED
  );
}

function getHeadlessCallSessionCount(): number {
  return (
    (global as { __headlessCallSessions?: Map<string, unknown> })
      .__headlessCallSessions?.size ?? 0
  );
}

function hasAndroidSipActivity(
  calls: Record<string, ContextCallInfo>,
  sippyCup: SippyCup | null
): boolean {
  return (
    hasActiveCall() ||
    hasLiveCallsInState(calls) ||
    getHeadlessCallSessionCount() > 0 ||
    !!sippyCup?.hasActiveSipSessions?.()
  );
}

/** When ending one leg of a multi-call session, show CONNECTED, then held, then any ringing. */
function pickPreferredActiveSessionId(
  calls: Record<string, ContextCallInfo>
): string | undefined {
  const list = Object.values(calls).filter(
    (c) => c.state !== CallState.ENDED && c.state !== CallState.FAILED
  );
  if (list.length === 0) return undefined;
  const connected = list.find((c) => c.state === CallState.CONNECTED);
  if (connected) return connected.sessionId;
  const held = list.find((c) => c.isOnHold);
  if (held) return held.sessionId;
  return list[0].sessionId;
}

/**
 * Convert CallInfo to ContextCallInfo
 */
const callInfoToContextCall = (
  callInfo: CallInfo,
  callId?: string
): ContextCallInfo => ({
  // Use server call ID for API operations, fallback to session ID if not available
  callId: callInfo.serverCallId || callId || callInfo.id,
  sessionId: callInfo.id,
  state: callInfo.state,
  direction: callInfo.direction,
  remoteDisplayName: callInfo.remoteDisplayName,
  remoteUri: callInfo.remoteUri,
  remoteParty: undefined, // Will be set from SIP headers if available
  startTime: callInfo.startTime.toISOString(),
  answerTime: callInfo.answerTime?.toISOString(),
  endTime: callInfo.endTime?.toISOString(),
  isMuted: callInfo.isMuted,
  isOnHold: callInfo.isOnHold,
  isSpeakerOn: callInfo.isSpeakerOn,
  isEmergency: callInfo.isEmergency,
  connected: callInfo.state === CallState.CONNECTED,
  recording: false,
  conferencing: false,
  conferenceId: undefined,
  attendedTransfer: false,
  parentSessionId: undefined,
  childSessionId: undefined,
  totalCallDuration: 0,
  currentHoldDuration: 0,
  totalHoldDuration: 0,
  mutedConferenceParticipants: [],
  ...(callInfo.callUuid !== undefined ? { callUuid: callInfo.callUuid } : {}),
  ...(callInfo.voipPayload !== undefined
    ? { voipPayload: callInfo.voipPayload }
    : {})
});

/**
 * Simplified SoftphoneProvider
 * Single source of truth: calls record
 * Computed properties for currentCall, incomingCalls, etc.
 */
export const SoftphoneProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  // Get user data from Redux
  const user = useSelector((state: State) => state.userReducer.user);
  const accessToken = useSelector(
    (state: State) => state.authReducer.accessToken
  );
  const navigation = useNavigation<any>();

  // Simplified state - single source of truth
  const [state, setState] = useState<SoftphoneContextState>({
    isInitialized: false,
    isInitializing: false,
    isRegistered: false,
    isRegistering: false,
    config: null,
    calls: {},
    activeCallId: undefined,
    error: undefined
  });

  // SippyCup instance
  const sippyCupRef = useRef<SippyCup | null>(null);
  // Ref to latest state so getCallById/getChildCallBySessionId/getParentCallBySessionId
  // can read without calling setState (avoids "Cannot update component while rendering another").
  const stateRef = useRef(state);
  stateRef.current = state;
  // Guard against re-processing launch-from-answer and re-adding ghost calls.
  const handledLaunchFromAnswerRef = useRef<Set<string>>(new Set());
  /** Dedupe iOS stale-skip log per callUuid (Android trusts native Answer; no skip). */
  const launchFromAnswerStaleLoggedRef = useRef<Set<string>>(new Set());
  /** One-shot retry of native launch-from-answer after SessionManager.register (Android). */
  const launchFromAnswerPostRegisterRetryDoneRef = useRef(false);
  /** Android: one deferred re-check so cold-start-from-notification can wait for SIP; second pass with no session = stale (e.g. Metro reload). */
  const launchFromAnswerAndroidDeferRef = useRef<Map<string, number>>(new Map());
  const launchIntentCheckedRef = useRef(false);
  const handledEndedCallIdsRef = useRef<Set<string>>(new Set());
  const isCompletingAttendedTransferRef = useRef(false);
  const isSwappingAttendedTransferRef = useRef(false);
  const initializingPromiseRef = useRef<Promise<SippyCup> | null>(null);
  const pendingOutgoingContactMetadataRef = useRef<{
    displayName?: string;
    avatarPath?: string | null;
  } | null>(null);
  /** Set when user taps End while activeCallId is the outbound placeholder `"dialing"`. */
  const outboundDialCancelledRef = useRef(false);
  /** Global guard: prevent initiating a second outbound call until the current one ends/fails. */
  const outboundCallInProgressRef = useRef(false);
  const lastBackgroundAtRef = useRef<number | null>(null);
  /** For Android: detect background→foreground to unregister primary SIP (inbound uses FCM wake-up only). */
  const androidAppStateRef = useRef(AppState.currentState);

  // Derived state - compute from calls record
  const currentCall = state.activeCallId
    ? state.calls[state.activeCallId]
    : null;

  const incomingCalls = Object.values(state.calls).filter(
    (call) =>
      call.state === CallState.INCOMING &&
      call.direction === CallDirection.INCOMING
  );

  const callsOnHold = Object.values(state.calls).filter(
    (call) => call.isOnHold
  );

  /**
   * Update a call in the calls record
   */
  const updateCall = useCallback(
    (callId: string, updates: Partial<ContextCallInfo>) => {
      setState((prev) => {
        const key = resolveCallsRecordKey(prev.calls, callId) ?? callId;
        const call = prev.calls[key];
        if (!call) return prev;

        return {
          ...prev,
          calls: {
            ...prev.calls,
            [key]: { ...call, ...updates }
          }
        };
      });
    },
    []
  );

  /**
   * Apply SIP/VoIP callStateChanged without resetting the call timer.
   * First CONNECTED sets answerTime; hold/unhold must keep the original.
   */
  const applyCallStateChangeFromEvent = useCallback(
    (callId: string, callState: CallState) => {
      if (callState === CallState.ENDED || callState === CallState.FAILED) {
        outboundCallInProgressRef.current = false;
      }
      setState((prev) => {
        const key = resolveCallsRecordKey(prev.calls, callId) ?? callId;
        const existing = prev.calls[key];
        if (!existing) return prev;
        const nextAnswerTime =
          callState === CallState.CONNECTED
            ? (existing.answerTime ?? new Date().toISOString())
            : existing.answerTime;
        return {
          ...prev,
          calls: {
            ...prev.calls,
            [key]: {
              ...existing,
              state: callState,
              connected: callState === CallState.CONNECTED,
              answerTime: nextAnswerTime
            }
          }
        };
      });
    },
    []
  );

  /**
   * Add a new call.
   * Preserves contactDisplayName/contactAvatarPath from existing call or pending ref
   * (from makeCall options) when the incoming call (from SIP/outgoingCall) doesn't have them.
   */
  const addCall = useCallback((call: ContextCallInfo) => {
    handledEndedCallIdsRef.current.delete(call.sessionId);
    const pending =
      call.direction === CallDirection.OUTGOING
        ? pendingOutgoingContactMetadataRef.current
        : null;
    setState((prev) => {
      const existing = prev.calls[call.sessionId];
      const displayName =
        call.contactDisplayName ??
        existing?.contactDisplayName ??
        pending?.displayName;
      const avatarPath =
        call.contactAvatarPath !== undefined
          ? call.contactAvatarPath
          : existing?.contactAvatarPath !== undefined
            ? existing.contactAvatarPath
            : pending?.avatarPath;
      const mergedCall: ContextCallInfo = {
        ...call,
        ...(displayName != null && { contactDisplayName: displayName }),
        ...(avatarPath !== undefined && { contactAvatarPath: avatarPath })
      };
      if (pending) {
        pendingOutgoingContactMetadataRef.current = null;
      }
      return {
        ...prev,
        calls: {
          ...prev.calls,
          [call.sessionId]: mergedCall
        }
      };
    });
  }, []);

  /**
   * Resolve and persist backend/server call ID for a session.
   * Useful for incoming web->mobile calls where callId may start as session UUID.
   */
  const hydrateCallBackendId = useCallback(
    async (sessionId: string, maxWaitMs = 1200): Promise<string | undefined> => {
      const resolveFromLatestState = () => {
        const latestCall = stateRef.current.calls[sessionId];
        const latestSipSession = getSipSession(sessionId);
        const cup = sippyCupRef.current;
        const smApiId = cup?.getServerCallIdForApi?.(sessionId);
        const resolvedId = resolveBackendCallId(
          latestCall,
          latestSipSession,
          smApiId
        );
        return { latestCall, resolvedId };
      };

      const persistIfNeeded = (
        latestCall: ContextCallInfo | undefined,
        resolvedId: string | undefined
      ) => {
        if (
          latestCall &&
          resolvedId &&
          resolvedId !== latestCall.callId &&
          resolvedId !== latestCall.sessionId
        ) {
          updateCall(sessionId, { callId: resolvedId });
        }
      };

      let { latestCall, resolvedId } = resolveFromLatestState();
      persistIfNeeded(latestCall, resolvedId);
      if (resolvedId && resolvedId !== sessionId) {
        return resolvedId;
      }

      const startedAt = Date.now();
      while (Date.now() - startedAt < maxWaitMs) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        ({ latestCall, resolvedId } = resolveFromLatestState());
        persistIfNeeded(latestCall, resolvedId);
        if (resolvedId && resolvedId !== sessionId) {
          return resolvedId;
        }
      }

      return resolvedId;
    },
    [updateCall]
  );

  /**
   * Clean up transfer relationships when calls end unexpectedly
   */
  const cleanupTransferRelationships = useCallback((endedCallId: string) => {
    setState((prev) => {
      const endedCall = prev.calls[endedCallId];
      if (!endedCall) return prev;

      const updatedCalls = { ...prev.calls };
      let newActiveCallId = prev.activeCallId;

      // If this was a child call (has parentSessionId)
      if (endedCall.parentSessionId) {
        const parentCall = updatedCalls[endedCall.parentSessionId];
        if (parentCall) {
          // Show toast notification
          toast("Transfer call ended", {
            duration: 3000,
            icon: "📞"
          });

          // Clear childSessionId from parent call
          updatedCalls[endedCall.parentSessionId] = {
            ...parentCall,
            childSessionId: undefined
          };

          // Unhold parent call if it's on hold
          if (parentCall.isOnHold) {
            setTimeout(() => {
              if (sippyCupRef.current) {
                sippyCupRef.current
                  .unholdCall(parentCall.sessionId)
                  .catch((error) => {
                    logger.error(
                      "Failed to unhold parent call after child ended:",
                      error
                    );
                  });
              }
            }, 0);
          }

          // Set parent as active call
          newActiveCallId = parentCall.sessionId;
        }
      }

      // If this was a parent call (has childSessionId)
      if (endedCall.childSessionId) {
        const childCall = updatedCalls[endedCall.childSessionId];
        if (childCall) {
          // Show toast notification
          toast("Original call ended", {
            duration: 3000,
            icon: "📞"
          });

          // Clear parentSessionId from child call
          updatedCalls[endedCall.childSessionId] = {
            ...childCall,
            parentSessionId: undefined
          };

          // Set child as active call
          newActiveCallId = childCall.sessionId;
        }
      }

      return {
        ...prev,
        calls: updatedCalls,
        activeCallId: newActiveCallId
      };
    });
  }, []);

  /**
   * Remove a call
   */
  const removeCall = useCallback((callId: string) => {
    setState((prev) => {
      const key = resolveCallsRecordKey(prev.calls, callId) ?? callId;
      if (!prev.calls[key]) return prev;
      const { [key]: removed, ...remainingCalls } = prev.calls;

      const activeMatched =
        prev.activeCallId === key || prev.activeCallId === callId;
      const newActiveCallId = activeMatched
        ? pickPreferredActiveSessionId(remainingCalls) ?? undefined
        : prev.activeCallId;

      return {
        ...prev,
        calls: remainingCalls,
        activeCallId: newActiveCallId
      };
    });
  }, []);

  /**
   * Set active call
   */
  const setActiveCallId = useCallback((callId: string | undefined) => {
    setState((prev) => ({ ...prev, activeCallId: callId }));
  }, []);

  /**
   * Initialize SippyCup with user config
   */
  useEffect(() => {
    if (user?.peerName && user?.peerSecret) {
      const config: SipConfig = {
        displayName: user.extName || "User",
        user: user.peerName,
        password: user.peerSecret,
        domain: "dev-sip.voxo.co",
        uri: "wss://api.voxo.co/webrtc",
        iceServers: [
          {
            urls: [
              "stun:stun.l.google.com:19302",
              "stun:stun1.l.google.com:19302"
            ]
          }
        ],
        useAudio: true,
        useVideo: false,
        useRinging: true,
        autoAnswer: false,
        autoReject: false
      };

      setState((prev) => ({ ...prev, config }));
    } else if (!user) {
      // Cleanup on logout - await dispose so SessionManager singleton is reset
      const cup = sippyCupRef.current;
      sippyCupRef.current = null;
      if (cup) {
        cup.dispose().catch(() => {});
      }
      try {
        VoipBridge.getInstance().dispose();
      } catch {
        /* ignore */
      }
      PendingCallManager.clearAllPendingCalls().catch(() => {});
      setState({
        isInitialized: false,
        isInitializing: false,
        isRegistered: false,
        isRegistering: false,
        config: null,
        calls: {},
        activeCallId: undefined,
        error: undefined
      });
    }
  }, [user]);

  /**
   * Setup VoIP bridge for handling VoIP push notifications
   */
  const setupVoipBridge = useCallback(async (): Promise<VoipBridge> => {
    const voipBridge = VoipBridge.getInstance();
    await voipBridge.initialize();

    // Handle VoIP call state changes
    voipBridge.on(
      "callStateChanged",
      (callId: string, callState: CallState) => {
        applyCallStateChangeFromEvent(callId, callState);

        // Auto-set active call for answered VoIP calls
        if (callState === CallState.CONNECTED && !state.activeCallId) {
          setActiveCallId(callId);
          // Navigate to InCallScreen when call is answered
          navigation.navigate("InCallScreen", { callId });
        }
      }
    );

    // Handle incoming VoIP call event (Wake-up strategy)
    voipBridge.on(
      "incomingVoipCall",
      async (callUuid: string, callInfo: CallInfo) => {
        console.log(
          "🟪 [SoftphoneProvider] 📞 incomingVoipCall event received - NEW CALL CREATED:",
          {
            callUuid,
            callInfoState: callInfo.state,
            remoteDisplayName: callInfo.remoteDisplayName,
            remoteUri: callInfo.remoteUri,
            hasVoipPayload: !!callInfo.voipPayload,
            platform: Platform.OS,
            timestamp: new Date().toISOString()
          }
        );
        logger.debug("Received incomingVoipCall in Provider", {
          callUuid,
          callInfo
        });

        const voipPayload = (callInfo.voipPayload ?? {}) as Record<
          string,
          unknown
        >;
        if (
          Platform.OS === "android" &&
          shouldSkipStaleVoipPush(
            voipPayload,
            callUuid,
            "SoftphoneProvider.incomingVoipCall"
          )
        ) {
          dismissStaleAndroidVoipCall(callUuid, {
            callUuid,
            callerName: callInfo.remoteDisplayName,
            callerNumber:
              (voipPayload.payload_callerNumber as string) ||
              (voipPayload.callerNumber as string) ||
              "Unknown Number",
            payload: voipPayload
          });
          return;
        }

        // Ensure NativeIntegration is ready before any inbound path can forward to native.
        const reduxState = store.getState() as any;
        const { authReducer: authState, userReducer: userState } = reduxState;
        const configOverride: SipConfig | null =
          userState.user && authState.isLoggedIn
            ? {
                displayName: userState.user.extName || "User",
                user: userState.user.peerName,
                password: userState.user.peerSecret,
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
              }
            : null;
        const preflightCup = await ensureInitialized(false, configOverride);
        await preflightCup.ensureNativeReady();

        // Kill-state Answer: avoid duplicate call insertion when effect/listeners re-run.
        const launchIntent = getAndClearLaunchIntent();
        if (launchIntent?.launchFromAnswer && launchIntent?.callUuid === callUuid) {
          const alreadyHandled = handledLaunchFromAnswerRef.current.has(callUuid);
          const existingKey = resolveCallsRecordKey(
            stateRef.current.calls,
            callUuid
          );
          const existingCall = existingKey
            ? stateRef.current.calls[existingKey]
            : undefined;
          const isTerminal =
            existingCall?.state === CallState.ENDED ||
            existingCall?.state === CallState.FAILED;
          if (!alreadyHandled && !isTerminal) {
            handledLaunchFromAnswerRef.current.add(callUuid);
            if (existingCall) {
              updateCall(callUuid, {
                state: CallState.CONNECTED,
                connected: true,
                answerTime: new Date().toISOString()
              });
            } else {
              const answeredCallInfo = { ...callInfo, state: CallState.CONNECTED };
              const call = callInfoToContextCall(answeredCallInfo, callUuid);
              addCall(call);
            }
            const navId = existingCall?.sessionId ?? callUuid;
            setActiveCallId(navId);
            setTimeout(
              () => navigation.navigate("InCallScreen", { callId: navId }),
              100
            );
          }
        }

        // Extract IP from payload (Android FCM uses payload_ip; iOS may use callerIp/ip)
        const payload = callInfo.voipPayload;
        const callerIp =
          payload?.payload_ip ||
          payload?.callerIp ||
          payload?.ip ||
          payload?.data?.callerIp ||
          payload?.dictionaryPayload?.callerIp;

        console.log(
          `� [SoftphoneProvider] 📞 Extracted caller IP: ${callerIp}`
        );

        if (callerIp) {
          const { authReducer, userReducer } = reduxState;

          if (Platform.OS === "android") {
            // FCM inbound: SessionManager only (same stack as outbound / transfer / merge).
            if (!authReducer.isLoggedIn || !userReducer.user) {
              console.error(
                "[SoftphoneProvider] Android incomingVoipCall: user not logged in"
              );
              return;
            }
            const configOverrideAndroid: SipConfig = {
              displayName: userReducer.user.extName || "User",
              user: userReducer.user.peerName,
              password: userReducer.user.peerSecret,
              domain: "dev-sip.voxo.co",
              uri: "wss://api.voxo.co/webrtc",
              iceServers: [
                {
                  urls: [
                    "stun:stun.l.google.com:19302",
                    "stun:stun1.l.google.com:19302"
                  ]
                }
              ],
              useAudio: true,
              useVideo: false,
              useRinging: true,
              autoAnswer: false,
              autoReject: false
            };
            try {
              const sippyCupInbound = await ensureInitialized(
                false,
                configOverrideAndroid
              );
              await sippyCupInbound.ensureNativeReady();
              if (stateRef.current.isRegistered) {
                console.warn(
                  `[SP] Android FCM: unregistering primary SIP before wake-up (inbound via FCM REGISTER only)`
                );
                await sippyCupInbound.unregister();
              }
              console.warn(
                `[SP] Android FCM: SessionManager establishInboundSession callUuid=${callUuid}`
              );
              await sippyCupInbound.establishInboundSession(
                callUuid,
                callerIp
              );
              // incomingCall (during establish) already added the row keyed by SIP session id with callUuid set.
              // Do not re-add under push UUID — that broke applyCallStateChangeFromEvent (key mismatch).
              const sipRow = Object.values(stateRef.current.calls).find(
                (c) => c.callUuid === callUuid
              );
              if (sipRow) {
                if (callInfo.voipPayload != null) {
                  updateCall(sipRow.sessionId, {
                    voipPayload: callInfo.voipPayload
                  });
                }
                setActiveCallId(sipRow.sessionId);
                navigation.navigate("InCallScreen", {
                  callId: sipRow.sessionId
                });
              } else {
                console.warn(
                  "[SP] Android FCM: no SIP call row after establish; VoIP placeholder"
                );
                const voipCallEntry: ContextCallInfo = {
                  ...callInfoToContextCall(callInfo, callUuid),
                  callId: callUuid,
                  sessionId: callUuid,
                  state: CallState.INCOMING,
                  voipPayload: callInfo.voipPayload
                };
                addCall(voipCallEntry);
                setActiveCallId(callUuid);
                navigation.navigate("InCallScreen", { callId: callUuid });
              }
            } catch (e: any) {
              logger.error("Android FCM inbound SessionManager failed", e);
              if (e.error === "RECEIVE_INVITE_TIMEOUT") {
                console.error("[SoftphoneProvider] INVITE timeout (Android FCM)");
              } else if (e.error === "INVITE_ANSWERED_ELSEWHERE") {
                console.error("[SoftphoneProvider] Answered elsewhere");
              } else if (e.error === "INVITE_CANCELLED_EARLY") {
                console.error("[SoftphoneProvider] Call cancelled");
              } else if (e.error === "REGISTRATION_FAILED") {
                console.error("[SoftphoneProvider] Registration failed");
              }
            }
            return;
          }

          // iOS: SlimSipClient inbound (VoIP push)
          // CRITICAL: Check if NotificationManager is handling or has handled this call.
          // @ts-ignore
          const alreadyEstablished =
            global.pendingSipSessions &&
            global.pendingSipSessions.has(callUuid);
          // @ts-ignore
          const beingHandled = global.pendingVoipPushWakeup;
          console.warn(
            `📱 [SP] ${new Date().toISOString()} incomingVoipCall uuid=${callUuid} | alreadyEstablished=${alreadyEstablished} beingHandled=${beingHandled}`
          );
          if (alreadyEstablished || beingHandled) {
            console.warn(
              `� [SP] ${new Date().toISOString()} SKIPPED duplicate SlimSipClient for ${callUuid} (NM handling)`
            );
            if (alreadyEstablished) {
              // @ts-ignore
              const existingSession = global.pendingSipSessions.get(callUuid);
              // @ts-ignore
              const existingClient = global.pendingSipClients?.get(callUuid);
              if (existingSession && existingClient) {
                console.warn(
                  `📱 [SP] ${new Date().toISOString()} Adopting existing session from NM for ${callUuid}`
                );
                storeSipSession(callUuid, existingSession, existingClient);
              }
            }
            return;
          }

          try {
            console.warn(
              `� [SP] ${new Date().toISOString()} Creating NEW SlimSipClient for ${callUuid} (no NM handler)`
            );

            if (!authReducer.isLoggedIn || !userReducer.user) {
              console.error("🔵 [SoftphoneProvider] ❌ User not logged in");
              return;
            }

            const sipSettings: SipClientSettings = {
              routeOptions: {
                direction: "inbound",
                callUuid: callUuid
              },
              pcConfig: {
                bundlePolicy: "max-compat",
                iceServers: [
                  {
                    urls: [
                      "stun:stun.l.google.com:19302",
                      "stun:stun1.l.google.com:19302",
                      "stun:stun2.l.google.com:19302",
                      "stun:stun3.l.google.com:19302",
                      "stun:stun4.l.google.com:19302"
                    ]
                  }
                ],
                iceTransportPolicy: "all"
              },
              token: authReducer.accessToken,
              sipUri: `sip:${userReducer.user.peerName}@dev-sip.voxo.co`,
              name: "User",
              wsUrl: "wss://api.voxo.co/webrtc",
              password: userReducer.user.peerSecret
            };

            console.log(
              `🔵 [SoftphoneProvider] Creating SlimSipClient with settings:`,
              {
                sipUri: sipSettings.sipUri,
                wsUrl: sipSettings.wsUrl,
                callUuid
              }
            );

            const sipClient = new SlimSipClient(sipSettings);

            console.log(
              `🔵 [SoftphoneProvider] 📞 Calling sipClient.establishInboundSession (will wait for INVITE)...`
            );

            const sipSession = await sipClient.establishInboundSession(
              callUuid,
              callerIp
            );

            console.log(
              `� [SoftphoneProvider] 📞 ✅ Inbound session established, INVITE received`
            );
            console.log(
              `� [SoftphoneProvider] 📞 SipSession ready for CallKeep answer`
            );

            storeSipSession(callUuid, sipSession, sipClient);

            console.log(
              `🔵 [SoftphoneProvider] 📞 ✅ Session stored, waiting for user to answer via CallKeep`
            );
          } catch (e: any) {
            logger.error("Failed to establish inbound session", e);

            // Handle specific errors like voxo-mobile does
            if (e.error === "RECEIVE_INVITE_TIMEOUT") {
              console.error(
                "� [SoftphoneProvider] ❌ INVITE timeout (8 seconds)"
              );
            } else if (e.error === "INVITE_ANSWERED_ELSEWHERE") {
              console.error("� [SoftphoneProvider] ❌ Call answered elsewhere");
            } else if (e.error === "INVITE_CANCELLED_EARLY") {
              console.error("� [SoftphoneProvider] ❌ Call cancelled");
            } else if (e.error === "REGISTRATION_FAILED") {
              console.error("� [SoftphoneProvider] ❌ Registration failed");
            }
          }
        } else {
          logger.warn(
            "No caller IP found in payload, skipping wake-up registration"
          );
        }
      }
    );

    // Handle VoIP call end (from CallKit end button, in-app hangup, or caller hung up before answer)
    voipBridge.on("endVoipCall", async (callId: string) => {
      // Clear NativeIntegration.activeCalls immediately (before any await) so notification
      // does not reappear when user locks/unlocks phone after remote hang up
      sippyCupRef.current?.clearCallFromNative(callId);

      const sipSession = getSipSession(callId);
      
      if (sipSession) {
        try {
          if (sipSession.isEnded?.()) {
            // Session already ended (remote hung up) — no SIP to send, just cleanup
            removeSipSession(callId);
          } else if (!sipSession.answered) {
            console.warn(
              `📞 [SP] endVoipCall: sending 603 Decline (unanswered) for ${callId}`
            );
            sipSession.sipRejectUserBusy();
            // Delay dispose so 603 can flush before WebSocket closes (single place for unanswered)
            setTimeout(() => removeSipSession(callId), 800);
          } else {
            console.warn(
              `📞 [SP] endVoipCall: sending BYE (answered) for ${callId}`
            );
            sipSession.sipTerminate();
            removeSipSession(callId);
          }
        } catch (e) {
          console.warn(
            `📞 [SP] endVoipCall: error for ${callId}:`,
            e
          );
          removeSipSession(callId);
        }
      } else if (Platform.OS === "android") {
        const vb = VoipBridge.getInstance();
        if (vb.isVoipCall(callId)) {
          try {
            const cup = sippyCupRef.current;
            if (cup) {
              await cup.hangupCall(callId);
            }
          } catch (e) {
            console.warn(
              `📞 [SP] endVoipCall: Android SessionManager hangup failed for ${callId}:`,
              e
            );
          }
        }
      }

      updateCall(callId, {
        state: CallState.ENDED,
        connected: false,
        endTime: new Date().toISOString()
      });

      // Use stateRef to avoid stale closure when remote hangs up while on InCallScreen
      const resolvedKey =
        resolveCallsRecordKey(stateRef.current.calls, callId) ?? callId;
      const wasActiveCall =
        stateRef.current.activeCallId === callId ||
        stateRef.current.activeCallId === resolvedKey;

      const remainingForActive = Object.values(stateRef.current.calls).filter(
        (c) => {
          const rowKey =
            resolveCallsRecordKey(stateRef.current.calls, c.sessionId) ??
            c.sessionId;
          if (rowKey === resolvedKey) return false;
          if (c.callUuid && (c.callUuid === callId || c.callUuid === resolvedKey)) {
            return false;
          }
          return (
            c.state !== CallState.ENDED && c.state !== CallState.FAILED
          );
        }
      );

      if (wasActiveCall) {
        if (remainingForActive.length > 0) {
          const nextId = pickPreferredActiveSessionId(
            Object.fromEntries(
              remainingForActive.map((c) => [c.sessionId, c])
            ) as Record<string, ContextCallInfo>
          );
          if (nextId) {
            setActiveCallId(nextId);
          }
        } else {
          setActiveCallId(undefined);
          try {
            const isOnInCallScreen =
              getCurrentRoute()?.name === Routes.InCallScreen;
            if (isOnInCallScreen && navigation.canGoBack?.()) {
              navigation.goBack();
            }
          } catch (e) {
            console.warn(`📞 [SP] endVoipCall: goBack failed`, e);
          }
        }
      }

      // Emit callStateChanged so NativeIntegration stops ringtone, ends CallKeep, cleans up
      const sippyCup = await ensureInitialized(false);
      sippyCup.emit("callStateChanged", callId, CallState.ENDED);

      // Remove the call promptly (no long delay)
      removeCall(callId);
    });

    // Omitted ensureInitialized from deps (declared below) to avoid TS2448; closure still uses latest ensureInitialized.
    return voipBridge;
  }, [
    applyCallStateChangeFromEvent,
    updateCall,
    removeCall,
    setActiveCallId,
    addCall,
    navigation
  ]);

  /**
   * Initialize VoIP bridge
   */
  useEffect(() => {
    let voipBridge: VoipBridge;

    const initializeVoipBridge = async () => {
      voipBridge = await setupVoipBridge();
    };

    initializeVoipBridge();

    return () => {
      if (voipBridge) {
        // Do not dispose on dep change (background/foreground re-renders) — FCM onMessage
        // can arrive before re-init and would hit "VoIP Bridge not initialized".
        voipBridge.removeAllListeners();
      }
    };
  }, [setupVoipBridge]);

  /**
   * Setup SippyCup event listeners
   */
  const setupEventListeners = useCallback(
    (sippyCup: SippyCup) => {
      // System events
      sippyCup.on("initialized", () => {
        setState((prev) => ({
          ...prev,
          isInitialized: true,
          isInitializing: false
        }));
      });

      sippyCup.on("registered", () => {
        androidCallFlowLog("session", "registered event", {});
        setState((prev) => ({
          ...prev,
          isRegistered: true,
          isRegistering: false
        }));
      });

      sippyCup.on("unregistered", () => {
        androidCallFlowLog("session", "unregistered event", {});
        setState((prev) => ({
          ...prev,
          isRegistered: false
        }));
      });

      sippyCup.on("error", (error) => {
        logger.error("SippyCup error:", error);
        androidCallFlowError("session", "SippyCup error event", error);
        setState((prev) => ({
          ...prev,
          isInitializing: false,
          isRegistering: false
        }));
      });

      // Call events - use stateRef to read current state (never call setState from inside setState callback)
      sippyCup.on("incomingCall", (callId: string, callInfo: CallInfo) => {
        androidCallFlowLog("incomingCall", "incoming SIP event", {
          callId,
          remoteUri: callInfo.remoteUri,
          remoteDisplayName: callInfo.remoteDisplayName
        });
        // iOS SlimSip-only inbound: skip SessionManager incomingCall (SlimSip handles INVITE).
        if (USE_SLIMSIP_INBOUND_ONLY) {
          console.warn(
            `📞 [SP] ${new Date().toISOString()} incomingCall: USE_SLIMSIP_INBOUND_ONLY - skipping SessionManager (SlimSipClient handles) callId=${callId}`
          );
          return;
        }
        // On iOS in background: skip adding SessionManager call. The VoIP push path will handle it.
        if (Platform.OS === "ios" && AppState.currentState !== "active") {
          console.warn(
            `📞 [SP] ${new Date().toISOString()} incomingCall: iOS background - skipping SessionManager call (VoIP path will handle) callId=${callId}`
          );
          return;
        }

        const voipBridge = VoipBridge.getInstance();
        const callerNumber =
          callInfo.remoteUri?.match(/sip:(\d+)@/)?.[1] ||
          callInfo.remoteDisplayName?.replace(/\D/g, "") ||
          "";

        logger.debug("Incoming SIP INVITE, checking for matching VoIP call", {
          sipCallId: callId,
          callerNumber,
          remoteUri: callInfo.remoteUri,
          remoteDisplayName: callInfo.remoteDisplayName
        });

        const currentState = stateRef.current;
        const allCalls = Object.values(currentState.calls);
        logger.debug("Current calls in state", {
          callCount: allCalls.length,
          calls: allCalls.map((c) => ({
            sessionId: c.sessionId,
            isVoip: voipBridge.isVoipCall(c.sessionId),
            remoteUri: c.remoteUri,
            remoteDisplayName: c.remoteDisplayName,
            state: c.state
          }))
        });

        const matchingVoipCall = Object.values(currentState.calls).find(
          (call) =>
            voipBridge.isVoipCall(call.sessionId) &&
            (call.remoteUri?.includes(callerNumber) ||
              call.remoteDisplayName?.includes(callerNumber) ||
              callInfo.remoteUri?.includes(
                call.remoteDisplayName?.replace(/\D/g, "") || ""
              ))
        );

        if (matchingVoipCall) {
          logger.debug("Matching VoIP call found, replacing with SIP session", {
            voipCallId: matchingVoipCall.sessionId,
            sipCallId: callId,
            callerNumber
          });
          removeCall(matchingVoipCall.sessionId);
          const call = callInfoToContextCall(
            callInfo,
            matchingVoipCall.callId || callId
          );
          addCall(call);
          setActiveCallId(call.sessionId);
          if (currentState.activeCallId !== matchingVoipCall.sessionId) {
            navigation.navigate("InCallScreen", { callId: call.sessionId });
          }
        } else {
          const call = callInfoToContextCall(callInfo, callId);
          addCall(call);
          console.log(
            "📱 [SoftphoneProvider] Incoming call, navigating to InCallScreen:",
            {
              callId: call.sessionId,
              callerName: call.remoteDisplayName
            }
          );
          setActiveCallId(call.sessionId);
          navigation.navigate("InCallScreen", { callId: call.sessionId });
        }
      });

      sippyCup.on("outgoingCall", (callId: string, callInfo: CallInfo) => {
        androidCallFlowLog("outgoingCall", "outgoing event", {
          callId,
          state: callInfo.state
        });
        const call = callInfoToContextCall(callInfo, callId);
        addCall(call);
      });

      sippyCup.on(
        "callStateChanged",
        (callId: string, callState: CallState) => {
          if (
            callState === CallState.CONNECTED ||
            callState === CallState.OUTGOING ||
            callState === CallState.INCOMING ||
            callState === CallState.FAILED
          ) {
            androidCallFlowLog("callStateChanged", "state transition", {
              callId,
              callState
            });
          }
          console.log(
            "🟠 [SoftphoneProvider] 📞 callStateChanged event received:",
            {
              callId,
              callState,
              currentActiveCallId: state.activeCallId,
              timestamp: new Date().toISOString()
            }
          );

          // Defer state updates to avoid "Cannot update component while rendering another" warning.
          setTimeout(() => {
            applyCallStateChangeFromEvent(callId, callState);

            // Auto-set active call for new outgoing/answered calls
            if (isCompletingAttendedTransferRef.current) {
              console.log(
                "🟠 [SoftphoneProvider] 📞 Skipping active call promotion during attended transfer completion",
                { callId, callState }
              );
              return;
            }
            if (callState === CallState.CONNECTED && !state.activeCallId) {
              console.log(
                "🟠 [SoftphoneProvider] 📞 ✅ Call CONNECTED, navigating to InCallScreen:",
                {
                  callId,
                  previousActiveCallId: state.activeCallId
                }
              );
              setActiveCallId(callId);
              navigation.navigate("InCallScreen", { callId });
            } else {
              console.log(
                "🟠 [SoftphoneProvider] 📞 Call state changed but not navigating:",
                {
                  callId,
                  callState,
                  reason:
                    callState === CallState.CONNECTED
                      ? "activeCallId already set"
                      : "not CONNECTED",
                  currentActiveCallId: state.activeCallId
                }
              );
            }
          }, 0);
        }
      );

      sippyCup.on("callEnded", (callId: string, _reason: string) => {
        androidCallFlowLog("callEnded", "call ended event", {
          callId,
          reason: _reason,
          activeCallId: stateRef.current.activeCallId ?? null
        });
        if (handledEndedCallIdsRef.current.has(callId)) {
          console.warn(
            `📞 [SP] ${new Date().toISOString()} duplicate callEnded ignored: callId=${callId} reason=${_reason}`
          );
          return;
        }
        handledEndedCallIdsRef.current.add(callId);
        if (handledEndedCallIdsRef.current.size > 500) {
          handledEndedCallIdsRef.current.clear();
        }

        console.warn(
          `📞 [SP] ${new Date().toISOString()} callEnded event: callId=${callId} reason=${_reason} activeCallId=${
            state.activeCallId
          }`
        );
        // Handle transfer relationship cleanup for edge cases
        cleanupTransferRelationships(callId);

        // Remove the call from state
        removeCall(callId);

        // Navigate back only when there is no promoted active call left.
        setTimeout(() => {
          setState((currentState) => {
            const hasLiveCall = Object.values(currentState.calls).some(
              (call) => call.state !== CallState.ENDED
            );
            if (!currentState.activeCallId && !hasLiveCall) {
              console.warn(
                `📞 [SP] ${new Date().toISOString()} callEnded: no active call remains, navigating back`
              );
              try {
                const isOnInCallScreen =
                  getCurrentRoute()?.name === Routes.InCallScreen;
                if (isOnInCallScreen && navigation.canGoBack?.()) {
                  navigation.goBack();
                }
              } catch (e) {
                console.warn(`📞 [SP] callEnded: goBack failed`, e);
              }
            }
            return currentState;
          });
        }, 0);

        // iOS SlimSip-only: unregister when no SessionManager calls remain (next inbound via VoIP push).
        // Defer so SessionManager has finished removing the call from managedSessions (delete happens after emit).
        setTimeout(() => {
          if (
            USE_SLIMSIP_INBOUND_ONLY &&
            sippyCup.getActiveCalls().length === 0
          ) {
            sippyCup
              .unregister()
              .catch((e: any) =>
                console.warn(
                  "📞 [SP] Unregister after call end:",
                  e?.message || e
                )
              );
          }
        }, 0);
      });

      // Call property events
      sippyCup.on("callHeld", (callId: string) => {
        updateCall(callId, { isOnHold: true });
      });

      sippyCup.on("callUnheld", (callId: string) => {
        updateCall(callId, { isOnHold: false });
        const key =
          resolveCallsRecordKey(stateRef.current.calls, callId) ?? callId;
        setActiveCallId(key);
      });

      sippyCup.on("callMuted", (callId: string) => {
        updateCall(callId, { isMuted: true });
      });

      sippyCup.on("callUnmuted", (callId: string) => {
        updateCall(callId, { isMuted: false });
      });

      sippyCup.on("callSpeakerOn", (callId: string) => {
        updateCall(callId, { isSpeakerOn: true });
      });

      sippyCup.on("callSpeakerOff", (callId: string) => {
        updateCall(callId, { isSpeakerOn: false });
      });

      // Note: Transfer state is now managed locally in the provider
      // SippyCup only handles SIP operations and emits standard call events
    },
    [
      addCall,
      removeCall,
      updateCall,
      applyCallStateChangeFromEvent,
      setActiveCallId,
      state.activeCallId,
      cleanupTransferRelationships
    ]
  );

  /**
   * Ensure SippyCup is initialized
   * @param forceRegisterForOutgoing When true (e.g. from makeCall), register SessionManager even if iOS SlimSip-only inbound
   * @param configOverride Optional config when state.config is null (e.g. incoming call before config effect ran)
   */
  const ensureInitialized = useCallback(
    async (
      forceRegisterForOutgoing = false,
      configOverride?: SipConfig | null
    ): Promise<SippyCup> => {
      const syncOutboundRegistration = async (cup: SippyCup): Promise<SippyCup> => {
        await cup.ensureRegisteredForOutbound();
        setState((prev) => ({
          ...prev,
          isInitialized: true,
          isRegistered: true,
          isRegistering: false,
          isInitializing: false
        }));
        return cup;
      };

      if (state.isInitializing && initializingPromiseRef.current) {
        const cup = await initializingPromiseRef.current;
        if (forceRegisterForOutgoing) {
          return syncOutboundRegistration(cup);
        }
        return cup;
      }

      const existingCup = sippyCupRef.current;
      if (existingCup && state.isInitialized) {
        if (forceRegisterForOutgoing) {
          return syncOutboundRegistration(existingCup);
        }
        if (
          existingCup.isStackRegistered() ||
          state.isRegistered ||
          (USE_SLIMSIP_INBOUND_ONLY && !forceRegisterForOutgoing) ||
          (!forceRegisterForOutgoing &&
            hasAndroidSipActivity(stateRef.current.calls, existingCup))
        ) {
          return existingCup;
        }
      }

      const config = state.config ?? configOverride;
      if (!config) {
        throw new Error("Softphone configuration not set");
      }

      const clearInitializingFlags = () =>
        setState((prev) => ({
          ...prev,
          isInitializing: false,
          isRegistering: false
        }));

      const runInitialization = async (): Promise<SippyCup> => {
        androidCallFlowLog("ensureInitialized", "runInitialization start", {
          forceRegisterForOutgoing,
          hasSippyCup: !!sippyCupRef.current,
          isInitialized: state.isInitialized,
          isRegistered: state.isRegistered
        });
        if (!sippyCupRef.current) {
          setState((prev) => ({ ...prev, isInitializing: true }));
          sippyCupRef.current = new SippyCup(config);
          setupEventListeners(sippyCupRef.current);
        }

        // Always run SippyCup.initialize(): it is idempotent, and React `state.isInitialized`
        // can be true while `sippyCupRef` was just replaced (e.g. after dispose + new instance),
        // which previously skipped initialize() and made register() throw
        // "SippyCup must be initialized before registering".
        await sippyCupRef.current.initialize();

        const cup = sippyCupRef.current;
        if (!cup.isStackRegistered()) {
          // iOS SlimSip-only inbound: don't register SessionManager at startup; register on outgoing.
          if (USE_SLIMSIP_INBOUND_ONLY && !forceRegisterForOutgoing) {
            logger.debug(
              "USE_SLIMSIP_INBOUND_ONLY - skipping SessionManager.register() (SlimSipClient for incoming only)"
            );
            clearInitializingFlags();
            return sippyCupRef.current!;
          }
          // CRITICAL: On iOS, do NOT register SessionManager (sip.js) while a VoIP push
          // call is being handled by SlimSipClient (jssip). If SessionManager registers,
          // the SIP proxy sees multiple registrations and the INVITE never completes.
          if (Platform.OS === "ios" && !forceRegisterForOutgoing) {
            // @ts-ignore
            if (global.pendingVoipPushWakeup) {
              console.warn(
                `📱 [SP] ${new Date().toISOString()} DEFERRED SessionManager.register() - pendingVoipPushWakeup=true`
              );
              clearInitializingFlags();
              return sippyCupRef.current!;
            }
            // Fallback: check UserDefaults directly — the flag might not be set yet because
            // SoftphoneProvider effects run BEFORE NotificationManager's didLoadWithEvents.
            const pendingCalls = await PendingCallManager.getPendingCalls();
            if (Object.keys(pendingCalls).length > 0) {
              console.warn(
                `📱 [SP] ${new Date().toISOString()} DEFERRED SessionManager.register() - pending UserDefaults: ${Object.keys(
                  pendingCalls
                ).join(", ")}`
              );
              clearInitializingFlags();
              return sippyCupRef.current!;
            }
            console.warn(
              `📱 [SP] ${new Date().toISOString()} No VoIP push pending, proceeding with SessionManager.register()`
            );
          } else {
            // Android: do not REGISTER until first-run permission prompts have finished (system
            // sheets are not "active", which previously bypassed foreground deferral).
            if (
              !forceRegisterForOutgoing &&
              !getAndroidPermissionPromptsComplete()
            ) {
              console.warn(
                `📱 [SP] ${new Date().toISOString()} DEFERRED SessionManager.register() - Android permission prompts not complete yet`
              );
              clearInitializingFlags();
              return sippyCupRef.current!;
            }
            // Android: defer primary REGISTER while app is foreground so inbound uses FCM
            // establishInboundSession (wake-up UA) only — avoids duplicate INVITE / dual registrations.
            // Outbound uses ensureInitialized(true). When user leaves foreground, AppState listener completes register.
            if (!forceRegisterForOutgoing && AppState.currentState === "active") {
              console.warn(
                `📱 [SP] ${new Date().toISOString()} DEFERRED SessionManager.register() - Android foreground (FCM inbound or forceRegister outbound)`
              );
              clearInitializingFlags();
              return sippyCupRef.current!;
            }
            if (
              !forceRegisterForOutgoing &&
              (VoipBridge.getInstance().hasTrackedVoipCalls() ||
                hasActiveCall() ||
                getHeadlessCallSessionCount() > 0 ||
                sippyCupRef.current?.hasActiveSipSessions?.())
            ) {
              console.warn(
                `📱 [SP] ${new Date().toISOString()} DEFERRED SessionManager.register() - Android VoIP/FCM inbound (tracked VoIP or hasActiveCall)`
              );
              clearInitializingFlags();
              return sippyCupRef.current!;
            }
            console.warn(
              `📱 [SP] ${new Date().toISOString()} Android - proceeding with SessionManager.register()`
            );
          }
          setState((prev) => ({ ...prev, isRegistering: true }));
          console.warn(
            `📱 [SP] ${new Date().toISOString()} Calling SessionManager.register()...`
          );
          androidCallFlowLog("ensureInitialized", "calling SessionManager.register()", {
            forceRegisterForOutgoing
          });
          await cup.register();
          console.warn(
            `📱 [SP] ${new Date().toISOString()} SessionManager.register() completed`
          );
          androidCallFlowLog(
            "ensureInitialized",
            "SessionManager.register() completed",
            {}
          );
        }

        if (forceRegisterForOutgoing && cup && !cup.isStackRegistered()) {
          await cup.ensureRegisteredForOutbound();
        }

        clearInitializingFlags();
        return sippyCupRef.current!;
      };

      if (!initializingPromiseRef.current) {
        initializingPromiseRef.current = runInitialization()
          .catch((error) => {
            if (isRegistererTerminatedError(error)) {
              logger.warn(
                "ensureInitialized: sip registerer terminated (non-fatal)"
              );
              setState((prev) => ({
                ...prev,
                isInitializing: false,
                isRegistering: false,
                isRegistered: false
              }));
              if (sippyCupRef.current) {
                return sippyCupRef.current;
              }
            }
            if (
              Platform.OS === "android" &&
              hasAndroidSipActivity(stateRef.current.calls, sippyCupRef.current)
            ) {
              logger.warn(
                "ensureInitialized failed during active SIP session — keeping stack alive"
              );
              setState((prev) => ({
                ...prev,
                isInitializing: false,
                isRegistering: false
              }));
              if (sippyCupRef.current) {
                return sippyCupRef.current;
              }
            }
            logger.error("Failed to initialize:", error);
            androidCallFlowError("ensureInitialized", "initialization failed", error, {
              forceRegisterForOutgoing
            });
            setState((prev) => ({
              ...prev,
              isInitializing: false,
              isRegistering: false,
              isInitialized: false,
              isRegistered: false,
              activeCallId: undefined
            }));
            // Dispose broken SippyCup so next attempt creates fresh SessionManager
            const cup = sippyCupRef.current;
            sippyCupRef.current = null;
            if (cup) {
              cup.dispose().catch(() => {});
            }
            PendingCallManager.clearAllPendingCalls().catch(() => {});
            throw error;
          })
          .finally(() => {
            initializingPromiseRef.current = null;
          });
      }

      return initializingPromiseRef.current;
    },
    [
      state.config,
      state.isInitialized,
      state.isRegistered,
      state.isInitializing,
      setupEventListeners
    ]
  );

  const navigateToInCallScreen = useCallback((callId: string) => {
    InteractionManager.runAfterInteractions(() => {
      setTimeout(() => {
        try {
          navigation.navigate("InCallScreen", { callId });
        } catch (e) {
          console.warn(
            "🟪 [SoftphoneProvider] Navigate to InCallScreen failed, will retry:",
            e
          );
        }
      }, 200);
    });
  }, [navigation]);

  type HeadlessCallEntry = {
    sessionManager: SessionManager;
    sessionId: string;
  };

  const getAndroidHeadlessEntry = useCallback(
    (callUuid: string): HeadlessCallEntry | undefined => {
      if (Platform.OS !== "android" || !callUuid) return undefined;
      const map = (global as { __headlessCallSessions?: Map<string, HeadlessCallEntry> })
        .__headlessCallSessions;
      return map?.get(callUuid);
    },
    []
  );

  const getLiveCallInfoForUuid = useCallback(
    (callUuid: string, headless?: HeadlessCallEntry): CallInfo | undefined => {
      if (headless?.sessionManager) {
        return (
          headless.sessionManager.getCallState(callUuid) ??
          headless.sessionManager.getCallState(headless.sessionId)
        );
      }
      const cup = sippyCupRef.current;
      if (cup && typeof cup.getCallState === "function") {
        return cup.getCallState(callUuid) as CallInfo | undefined;
      }
      return undefined;
    },
    []
  );

  const promoteAnsweredCallToUi = useCallback(
    (
      callUuid: string,
      callerName: string,
      callerNumber: string,
      liveInfo?: CallInfo
    ) => {
      const bridge = VoipBridge.getInstance();
      const existingKey = resolveCallsRecordKey(
        stateRef.current.calls,
        callUuid
      );
      const existingCall = existingKey
        ? stateRef.current.calls[existingKey]
        : undefined;
      const sipSessionId =
        liveInfo?.id ?? existingCall?.sessionId ?? callUuid;

      if (
        existingCall &&
        liveInfo?.id &&
        existingCall.sessionId === callUuid &&
        liveInfo.id !== callUuid
      ) {
        removeCall(callUuid);
        const call = callInfoToContextCall(
          { ...liveInfo, state: CallState.CONNECTED },
          callUuid
        );
        addCall(call);
      } else if (existingCall) {
        updateCall(callUuid, {
          state: CallState.CONNECTED,
          connected: true,
          answerTime: new Date().toISOString(),
          remoteDisplayName:
            existingCall.remoteDisplayName ||
            liveInfo?.remoteDisplayName ||
            callerName,
          remoteUri:
            existingCall.remoteUri ||
            liveInfo?.remoteUri ||
            `sip:${callerNumber}@dev-sip.voxo.co`
        });
      } else {
        const answeredCallInfo: CallInfo = liveInfo
          ? { ...liveInfo, state: CallState.CONNECTED }
          : {
              id: sipSessionId,
              callUuid,
              state: CallState.CONNECTED,
              direction: CallDirection.INCOMING,
              remoteDisplayName: callerName,
              remoteUri: `sip:${callerNumber}@dev-sip.voxo.co`,
              startTime: new Date(),
              answerTime: new Date(),
              isMuted: false,
              isOnHold: false,
              isSpeakerOn: false,
              isEmergency: false
            };
        const call = callInfoToContextCall(answeredCallInfo, callUuid);
        addCall(call);
      }

      const navId = sipSessionId;
      setActiveCallId(navId);
      setCallActive(true);
      bridge.registerHeadlessAnsweredCall(callUuid);
      sippyCupRef.current?.registerHeadlessCallMapping(
        callUuid,
        sipSessionId,
        callerName || liveInfo?.remoteDisplayName
      );

      if (Platform.OS === "android") {
        const Notifications = NativeModules.VoxoConnectAndroidNotifications as {
          showOngoingCallNotification?: (uuid: string, name: string) => void;
        };
        Notifications?.showOngoingCallNotification?.(
          callUuid,
          callerName || liveInfo?.remoteDisplayName || "Unknown"
        );
      }

      navigateToInCallScreen(navId);
      logger.debug("Promoted headless/launch answered call to InCall UI", {
        callUuid,
        navId
      });
    },
    [addCall, removeCall, updateCall, setActiveCallId, navigateToInCallScreen]
  );

  /** After background headless answer, attach main SippyCup to the live SessionManager singleton. */
  const adoptAndroidHeadlessCallsIntoUi = useCallback(async () => {
    if (Platform.OS !== "android" || !user) return;

    const map = (global as { __headlessCallSessions?: Map<string, HeadlessCallEntry> })
      .__headlessCallSessions;
    if (!map?.size) return;

    try {
      await ensureInitialized(false);
    } catch (e) {
      logger.warn("adoptAndroidHeadlessCallsIntoUi: ensureInitialized failed", e);
    }

    for (const [callUuid, entry] of [...map.entries()]) {
      if (handledLaunchFromAnswerRef.current.has(callUuid)) continue;

      const liveInfo = getLiveCallInfoForUuid(callUuid, entry);
      const live =
        liveInfo?.state === CallState.CONNECTED ||
        liveInfo?.state === CallState.CONNECTING;
      if (!live) continue;

      handledLaunchFromAnswerRef.current.add(callUuid);
      const callerName =
        liveInfo?.remoteDisplayName?.trim() || "Unknown Caller";
      const numberMatch = liveInfo?.remoteUri?.match(/^sip:(.+)@/);
      const callerNumber = numberMatch?.[1] ?? "Unknown";

      androidCallFlowLog("adoptHeadless", "foreground UI handoff", {
        callUuid,
        sessionId: entry.sessionId,
        state: liveInfo?.state
      });

      sippyCupRef.current?.registerHeadlessCallMapping(
        callUuid,
        entry.sessionId,
        callerName
      );

      promoteAnsweredCallToUi(callUuid, callerName, callerNumber, liveInfo);
    }
  }, [
    user,
    ensureInitialized,
    getLiveCallInfoForUuid,
    promoteAnsweredCallToUi
  ]);

  /**
   * Kill-state Answer: native reports launchFromAnswer + callUuid before SlimSip/Redux may exist.
   * Android uses SessionManager (not SlimSip) — trust native Answer and open InCall; iOS keeps stale guard.
   */
  const processLaunchFromAnswer = useCallback(
    (
      launchFromAnswer: boolean,
      callUuid: string,
      callerName?: string,
      callerNumber?: string
    ) => {
      if (!launchFromAnswer || !callUuid) return;
      if (handledLaunchFromAnswerRef.current.has(callUuid)) return;

      const existingKey = resolveCallsRecordKey(
        stateRef.current.calls,
        callUuid
      );
      const existingCall = existingKey
        ? stateRef.current.calls[existingKey]
        : undefined;
      if (
        existingCall?.state === CallState.ENDED ||
        existingCall?.state === CallState.FAILED
      ) {
        return;
      }

      const bridge = VoipBridge.getInstance();
      const existingSipSession = getSipSession(callUuid);
      const hasVoipBridge =
        bridge.isVoipCall(callUuid) || !!bridge.getVoipCallData(callUuid);
      const headlessEntry = getAndroidHeadlessEntry(callUuid);
      const liveInfo = getLiveCallInfoForUuid(callUuid, headlessEntry);
      const hasHeadlessLive =
        !!headlessEntry &&
        (liveInfo?.state === CallState.CONNECTED ||
          liveInfo?.state === CallState.CONNECTING);
      const smInfo = sippyCupRef.current?.getCallState?.(callUuid) as
        | CallInfo
        | undefined;
      const hasSessionManagerCall =
        smInfo?.state === CallState.CONNECTED ||
        smInfo?.state === CallState.CONNECTING ||
        smInfo?.state === CallState.INCOMING;
      const hasLive =
        !!existingCall ||
        !!existingSipSession ||
        hasVoipBridge ||
        hasSessionManagerCall ||
        hasHeadlessLive;

      if (hasLive) {
        launchFromAnswerAndroidDeferRef.current.delete(callUuid);
      }

      if (!hasLive) {
        if (Platform.OS === "android") {
          const deferPass = launchFromAnswerAndroidDeferRef.current.get(callUuid) ?? 0;
          if (deferPass === 0) {
            launchFromAnswerAndroidDeferRef.current.set(callUuid, 1);
            setTimeout(() => {
              processLaunchFromAnswer(
                launchFromAnswer,
                callUuid,
                callerName,
                callerNumber
              );
            }, 1500);
            return;
          }
          launchFromAnswerAndroidDeferRef.current.delete(callUuid);
          if (!launchFromAnswerStaleLoggedRef.current.has(callUuid)) {
            launchFromAnswerStaleLoggedRef.current.add(callUuid);
            logger.warn(
              "Skipping stale Android launch-from-answer (no live session after deferral; often Metro reload after remote hangup)",
              { callUuid }
            );
          }
          return;
        }
        if (!launchFromAnswerStaleLoggedRef.current.has(callUuid)) {
          launchFromAnswerStaleLoggedRef.current.add(callUuid);
          logger.warn(
            "Skipping stale launch-from-answer without live SIP session",
            { callUuid }
          );
        }
        return;
      }

      handledLaunchFromAnswerRef.current.add(callUuid);
      const caller = callerName ?? liveInfo?.remoteDisplayName ?? "Unknown Caller";
      const number =
        callerNumber ??
        liveInfo?.remoteUri?.match(/^sip:(.+)@/)?.[1] ??
        "Unknown";
      promoteAnsweredCallToUi(callUuid, caller, number, liveInfo);
      logger.debug("Launch-from-answer: navigated to InCallScreen", {
        callUuid,
        platform: Platform.OS
      });
    },
    [
      addCall,
      updateCall,
      setActiveCallId,
      navigateToInCallScreen,
      getAndroidHeadlessEntry,
      getLiveCallInfoForUuid,
      promoteAnsweredCallToUi
    ]
  );

  useEffect(() => {
    if (!state.isRegistered) {
      launchFromAnswerPostRegisterRetryDoneRef.current = false;
    }
  }, [state.isRegistered]);

  // Android: after SessionManager.register, re-read native launch-from-answer (timing vs cold start).
  useEffect(() => {
    if (
      Platform.OS !== "android" ||
      !state.isRegistered ||
      launchFromAnswerPostRegisterRetryDoneRef.current
    ) {
      return;
    }
    launchFromAnswerPostRegisterRetryDoneRef.current = true;
    const Notifications = NativeModules.VoxoConnectAndroidNotifications as {
      getLaunchFromAnswerIntent?: () => Promise<{
        launchFromAnswer?: boolean;
        callUuid?: string;
        callerName?: string;
        callerNumber?: string;
      } | null>;
    };
    if (!Notifications?.getLaunchFromAnswerIntent) return;
    const t = setTimeout(() => {
      Notifications.getLaunchFromAnswerIntent?.()
        .then((nativeIntent) => {
          if (
            nativeIntent?.launchFromAnswer &&
            nativeIntent?.callUuid &&
            !handledLaunchFromAnswerRef.current.has(nativeIntent.callUuid)
          ) {
            processLaunchFromAnswer(
              true,
              nativeIntent.callUuid,
              nativeIntent.callerName,
              nativeIntent.callerNumber
            );
          }
        })
        .catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [state.isRegistered, processLaunchFromAnswer]);

  useEffect(() => {
    if (!user) {
      return;
    }
    if (
      Platform.OS === "android" &&
      hasAndroidSipActivity(stateRef.current.calls, sippyCupRef.current)
    ) {
      return;
    }
    ensureInitialized();
  }, [user, ensureInitialized]);

  // Android: sip.js Registerer refresh after freeze/expiry must not fatal-crash the app.
  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }
    const errorUtils = (
      global as typeof globalThis & {
        ErrorUtils?: {
          getGlobalHandler?: () =>
            | ((error: unknown, isFatal?: boolean) => void)
            | undefined;
          setGlobalHandler?: (
            handler: (error: unknown, isFatal?: boolean) => void
          ) => void;
        };
      }
    ).ErrorUtils;
    if (!errorUtils?.getGlobalHandler || !errorUtils?.setGlobalHandler) {
      return;
    }
    const previousHandler = errorUtils.getGlobalHandler();
    errorUtils.setGlobalHandler((error, isFatal) => {
      if (isFatal && isRegistererTerminatedError(error)) {
        console.warn(
          `[SP] Suppressed fatal sip.Registerer error: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return;
      }
      previousHandler?.(error, isFatal);
    });
    return () => {
      if (previousHandler) {
        errorUtils.setGlobalHandler?.(previousHandler);
      }
    };
  }, []);

  // Android: when permission sequence completes, re-run init (deferred REGISTER path) and
  // unregister primary UA if anything registered during the bad window (Expires 0 / FCM owns inbound).
  useEffect(() => {
    if (Platform.OS !== "android" || !user) {
      return;
    }
    return subscribeAndroidPermissionPromptGate(() => {
      if (!getAndroidPermissionPromptsComplete()) {
        return;
      }
      void (async () => {
        try {
          await ensureInitialized(false);
          const cup = sippyCupRef.current;
          if (!cup) {
            return;
          }
          const hasCall =
            Object.values(stateRef.current.calls).some(
              (c) =>
                c.state !== CallState.ENDED && c.state !== CallState.FAILED
            ) ||
            getHeadlessCallSessionCount() > 0 ||
            !!sippyCupRef.current?.hasActiveSipSessions?.();
          if (hasCall) {
            return;
          }
          if (stateRef.current.isRegistering) {
            return;
          }
          if (stateRef.current.isRegistered) {
            console.warn(
              `📱 [SP] ${new Date().toISOString()} Android: unregister after permission prompts complete (primary SIP off; FCM inbound)`
            );
            await cup.unregister();
          }
        } catch (e) {
          logger.error(
            "Android permission gate: post-complete ensure/unregister failed:",
            e
          );
        }
      })();
    });
  }, [user, ensureInitialized]);

  // Android: keep primary SIP unregistered by default.
  // Registration should happen only on explicit flows (FCM inbound wake-up or outgoing).
  // NOTE: Do not auto-complete deferred REGISTER on background; launch-time app-state
  // transitions can otherwise trigger unintended registration.
  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }
    const sub = AppState.addEventListener("change", (next) => {
      const prev = androidAppStateRef.current;
      androidAppStateRef.current = next;

      if (prev === "active" && next !== "active") {
        lastBackgroundAtRef.current = Date.now();
        return;
      }

      if (next !== "active" || prev === "active") {
        return;
      }

      const lastBackgroundAt = lastBackgroundAtRef.current;
      if (!lastBackgroundAt) {
        return;
      }
      const idleMs = Date.now() - lastBackgroundAt;
      if (idleMs < RESUME_REINIT_IDLE_MS) {
        return;
      }

      const snapshot = stateRef.current;
      if (
        getLiveCallCount(snapshot.calls) > 0 ||
        getHeadlessCallSessionCount() > 0 ||
        sippyCupRef.current?.hasActiveSipSessions?.()
      ) {
        return;
      }

      androidCallFlowLog("resume", "long-idle foreground - resetting SIP stack", {
        idleMs,
        wasInitialized: snapshot.isInitialized,
        wasRegistered: snapshot.isRegistered
      });

      void (async () => {
        try {
          const cup = sippyCupRef.current;
          if (cup) {
            if (snapshot.isRegistered) {
              await cup.unregister();
            }
            await cup.dispose();
            sippyCupRef.current = null;
          }
        } catch (error) {
          logger.error("Android foreground long-idle reset failed:", error);
        } finally {
          setState((current) => ({
            ...current,
            isInitialized: false,
            isInitializing: false,
            isRegistered: false,
            isRegistering: false,
            ...(current.activeCallId === "dialing" ? { activeCallId: undefined } : {})
          }));
        }
      })();
    });

    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }
    const ENABLE_ANDROID_BACKGROUND_AUTO_REGISTER = false;
    if (!ENABLE_ANDROID_BACKGROUND_AUTO_REGISTER) {
      return;
    }
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "background") {
        return;
      }
      if (!user) {
        return;
      }
      if (stateRef.current.isRegistered) {
        return;
      }
      if (!sippyCupRef.current) {
        return;
      }
      console.warn(
        `📱 [SP] ${new Date().toISOString()} Android: app backgrounded — completing deferred SessionManager.register()`
      );
      ensureInitialized().catch((e) => {
        logger.error("Android deferred SessionManager.register on background failed:", e);
      });
    });
    return () => sub.remove();
  }, [user, ensureInitialized]);

  // Android: after returning from background, unregister primary UA so the registrar does not keep
  // the main contact. Foreground inbound is delivered via FCM → establishInboundSession only.
  // Outbound still uses ensureInitialized(true) to register on demand.
  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }
    let debounceUnregister: ReturnType<typeof setTimeout> | null = null;
    const sub = AppState.addEventListener("change", (next) => {
      const prev = androidAppStateRef.current;
      androidAppStateRef.current = next;
      if (debounceUnregister) {
        clearTimeout(debounceUnregister);
        debounceUnregister = null;
      }
      if (next !== "active") {
        return;
      }
      if (prev !== "background" && prev !== "inactive") {
        return;
      }
      debounceUnregister = setTimeout(() => {
        debounceUnregister = null;
        if (!user) {
          return;
        }
        const hasCall =
          Object.values(stateRef.current.calls).some(
            (c) =>
              c.state !== CallState.ENDED && c.state !== CallState.FAILED
          ) ||
          getHeadlessCallSessionCount() > 0 ||
          !!sippyCupRef.current?.hasActiveSipSessions?.();
        const headlessActive = getHeadlessCallSessionCount();
        if (hasCall || headlessActive > 0) {
          if (headlessActive > 0) {
            void adoptAndroidHeadlessCallsIntoUi();
          }
          return;
        }
        if (stateRef.current.isRegistering) {
          return;
        }
        if (!stateRef.current.isRegistered) {
          return;
        }
        const cup = sippyCupRef.current;
        if (!cup) {
          return;
        }
        console.warn(
          `📱 [SP] ${new Date().toISOString()} Android: foreground after background — unregistering primary SIP (FCM wake-up for inbound)`
        );
        cup.unregister().catch((e) => {
          logger.error("Android foreground unregister failed:", e);
        });
      }, 400);
    });
    return () => {
      sub.remove();
      if (debounceUnregister) {
        clearTimeout(debounceUnregister);
      }
    };
  }, [user, adoptAndroidHeadlessCallsIntoUi]);

  // Android: headless task may answer in background before launch intent is readable.
  useEffect(() => {
    if (Platform.OS !== "android" || !user) return;
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        void adoptAndroidHeadlessCallsIntoUi();
      }
    });
    return () => sub.remove();
  }, [user, adoptAndroidHeadlessCallsIntoUi]);

  // Retry SessionManager registration after VoIP push call is handled.
  // When ensureInitialized defers due to pendingVoipPushWakeup or pending UserDefaults,
  // this polls until cleared, then triggers registration for future foreground calls.
  // Skip when iOS SlimSip-only: we don't register SessionManager at startup.
  useEffect(() => {
    if (
      USE_SLIMSIP_INBOUND_ONLY ||
      Platform.OS !== "ios" ||
      state.isRegistered ||
      !state.isInitialized ||
      !sippyCupRef.current
    ) {
      return;
    }

    const retryInterval = setInterval(async () => {
      // @ts-ignore
      if (
        !global.pendingVoipPushWakeup &&
        sippyCupRef.current &&
        !state.isRegistered
      ) {
        console.warn(
          `📱 [SP] ${new Date().toISOString()} Retry: VoIP push handled, now registering SessionManager`
        );
        clearInterval(retryInterval);
        try {
          await ensureInitialized();
        } catch (error) {
          logger.error(
            "Failed to register SessionManager after VoIP push:",
            error
          );
        }
      }
    }, 2000);

    return () => clearInterval(retryInterval);
  }, [state.isRegistered, state.isInitialized, ensureInitialized]);

  // Public API methods
  const makeCall = useCallback(
    async (destination: string, options?: CallOptions): Promise<string> => {
      const snap = stateRef.current;
      if (
        outboundCallInProgressRef.current ||
        (snap.activeCallId && snap.activeCallId !== "testing")
      ) {
        Alert.alert(
          "Call in progress",
          "Please end the current call before making a new one."
        );
        throw new Error("Blocked: call already in progress");
      }
      // Set immediately to close the race window between multiple tap sources.
      outboundCallInProgressRef.current = true;
      const liveCalls = Object.values(snap.calls).filter(
        (c) => c.state !== CallState.ENDED && c.state !== CallState.FAILED
      );
      androidCallFlowLog("makeCall", "START outbound", {
        destination,
        activeCallId: snap.activeCallId ?? null,
        isInitializing: snap.isInitializing,
        isRegistering: snap.isRegistering,
        isRegistered: snap.isRegistered,
        isInitialized: snap.isInitialized,
        liveCallCount: liveCalls.length,
        liveSessionIds: liveCalls.map((c) => c.sessionId)
      });

      const resetSipStackForRetry = async (reason: string) => {
        androidCallFlowLog("makeCall", "reset SIP stack before retry", {
          reason
        });
        const current = sippyCupRef.current;
        if (current) {
          try {
            if (stateRef.current.isRegistered) {
              await current.unregister();
            }
          } catch (unregisterError) {
            logger.warn(
              "Failed to unregister during outbound retry reset:",
              unregisterError
            );
          } finally {
            await current.dispose();
            sippyCupRef.current = null;
          }
        }
        setState((prev) => ({
          ...prev,
          isInitialized: false,
          isInitializing: false,
          isRegistered: false,
          isRegistering: false
        }));
      };

      const shouldRetryOutboundSetup = (error: unknown): boolean => {
        const msg =
          error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
        return (
          msg.includes("timed out") ||
          msg.includes("timeout") ||
          msg.includes("already initializing") ||
          msg.includes("transport") ||
          msg.includes("not connected") ||
          msg.includes("503") ||
          msg.includes("service unavailable") ||
          msg.includes("reconnect") ||
          msg.includes("must be registered") ||
          msg.includes("must be initialized") ||
          msg.includes("user agent not initialized")
        );
      };

      let dialingWatchdog: ReturnType<typeof setTimeout> | null = null;

      const throwIfOutboundDialCancelled = (): void => {
        if (!outboundDialCancelledRef.current) return;
        outboundDialCancelledRef.current = false;
        throw new OutboundDialCancelled();
      };

      const throwIfOutboundDialCancelledAfterSession = async (
        sid: string
      ): Promise<void> => {
        if (!outboundDialCancelledRef.current) return;
        outboundDialCancelledRef.current = false;
        try {
          const cup = await withTimeout(
            ensureInitialized(true),
            OUTBOUND_INIT_TIMEOUT_MS,
            "ensureInitialized(true) (cancel hangup)"
          );
          await cup.hangupCall(sid);
          VoipBridge.getInstance().handleCallEnd(sid);
          cup.emit("callStateChanged", sid, CallState.ENDED);
        } catch (e) {
          logger.warn("cancel outbound: hangup failed", e);
        }
        throw new OutboundDialCancelled();
      };

      try {
        outboundDialCancelledRef.current = false;

        // Check permissions on Android before making call.
        if (!snap.config) {
          logger.error("makeCall: SIP config not loaded yet");
          Alert.alert(
            "Phone not ready",
            "Calling is still loading. Please wait a moment and try again.",
            [{ text: "OK" }]
          );
          throw new Error("Softphone configuration not ready");
        }

        // Show shell immediately (also prevents other UI paths from thinking there is no active call yet).
        setActiveCallId("dialing");

        if (Platform.OS === "android") {
          logger.debug("Checking Android call permissions before making call");
          const callPerms = await ensureAndroidCallPermissions();
          if (!callPerms.granted) {
            logger.error("Android call permissions not granted:", callPerms.missing);
            const missingList = callPerms.missing.join(", ") || "required permissions";
            Alert.alert(
              "Permissions Required",
              `Please enable the following in Settings to place calls: ${missingList}.`,
              [
                { text: "Cancel", style: "cancel" },
                { text: "Open Settings", onPress: () => Linking.openSettings() }
              ]
            );
            throw new Error("Android call permissions denied");
          }
          logger.debug("All Android call permissions granted");
        }

        // activeCallId already set to dialing above
        androidCallFlowLog("makeCall", "set activeCallId=dialing", {
          destination
        });
        throwIfOutboundDialCancelled();
        dialingWatchdog = setTimeout(() => {
          androidCallFlowLog("makeCall", "dialing watchdog fired; clearing stale state", {
            destination,
            activeCallIdAtWatchdog: stateRef.current.activeCallId ?? null
          });
          setState((prev) => ({
            ...prev,
            ...(prev.activeCallId === "dialing"
              ? {
                  activeCallId: undefined,
                  error: new Error("Call setup timed out. Please try again.")
                }
              : {})
          }));
        }, DIALING_WATCHDOG_TIMEOUT_MS);

        // Generate call UUID if not provided
        const callUuid = options?.callUuid || uuidv4();

        // Enhanced options with VoxoConnect-specific headers (like voxo-mobile: Call-Uuid, Outbound-Number-ID only)
        const enhancedOptions: CallOptions = {
          ...options,
          callUuid
        };

        // Handle emergency calls (911/933) - get location
        if (destination === "911" || destination === "933") {
          try {
            const location = await getCurrentLocation();
            enhancedOptions.locationData = location;
            enhancedOptions.isEmergency = true;
          } catch (error) {
            logger.error("Failed to get location for emergency call:", error);
            // Continue with call even if location fails
          }
        }

        throwIfOutboundDialCancelled();

        if (
          enhancedOptions.displayName != null ||
          enhancedOptions.avatarPath != null
        ) {
          pendingOutgoingContactMetadataRef.current = {
            displayName: enhancedOptions.displayName ?? undefined,
            avatarPath: enhancedOptions.avatarPath
          };
        }
        let sessionId: string | null = null;
        let lastSetupError: unknown;
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          try {
            androidCallFlowLog("makeCall", "attempt outbound setup", {
              destination,
              attempt,
              callUuid: enhancedOptions.callUuid
            });
            const sippyCup = await withTimeout(
              ensureInitialized(true),
              OUTBOUND_INIT_TIMEOUT_MS,
              "ensureInitialized(true)"
            );
            await sippyCup.ensureRegisteredForOutbound();
            androidCallFlowLog("makeCall", "ensureInitialized(true) complete", {
              destination,
              attempt,
              isRegistered: stateRef.current.isRegistered,
              cupRegistered: sippyCup.isStackRegistered(),
              isInitialized: stateRef.current.isInitialized
            });
            throwIfOutboundDialCancelled();
            sessionId = await withTimeout(
              sippyCup.makeCall(destination, enhancedOptions),
              OUTBOUND_RETRYABLE_SETUP_TIMEOUT_MS,
              "SippyCup.makeCall"
            );
            break;
          } catch (setupError) {
            if (isOutboundDialCancelled(setupError)) {
              throw setupError;
            }
            lastSetupError = setupError;
            const setupMsg =
              setupError instanceof Error
                ? setupError.message
                : String(setupError);
            androidCallFlowError("makeCall", "outbound setup attempt failed", setupError, {
              destination,
              attempt
            });
            if (attempt >= 2 || !shouldRetryOutboundSetup(setupError)) {
              throw setupError;
            }
            await resetSipStackForRetry(setupMsg);
            throwIfOutboundDialCancelled();
          }
        }
        if (!sessionId) {
          throw (
            lastSetupError ??
            new Error("Failed to establish outbound SIP session")
          );
        }
        androidCallFlowLog("makeCall", "SippyCup.makeCall returned sessionId", {
          destination,
          sessionId
        });

        await throwIfOutboundDialCancelledAfterSession(sessionId);

        // The outgoing call will be added via the 'outgoingCall' event handler
        // which includes the proper serverCallId extracted from SIP headers
        setActiveCallId(sessionId);
        androidCallFlowLog("makeCall", "SUCCESS activeCallId=sessionId", {
          destination,
          sessionId
        });

        return sessionId;
      } catch (failedOutbound) {
        if (isOutboundDialCancelled(failedOutbound)) {
          outboundDialCancelledRef.current = false;
          androidCallFlowLog("makeCall", "cancelled by user during setup", {
            destination
          });
          setState((prev) => ({
            ...prev,
            error: undefined,
            ...(prev.activeCallId === "dialing" ? { activeCallId: undefined } : {})
          }));
          return "";
        }
        // Hermes: avoid catch-binding + setState closure quirks — use a plain local
        const outboundFailure =
          failedOutbound instanceof Error
            ? failedOutbound
            : new Error(String(failedOutbound));
        logger.error("Failed to make call:", outboundFailure);
        androidCallFlowError("makeCall", "FAILED outbound", outboundFailure, {
          destination,
          activeCallIdAtFail: stateRef.current.activeCallId ?? null,
          callKeys: Object.keys(stateRef.current.calls)
        });
        setState((prev) => ({
          ...prev,
          error: outboundFailure,
          ...(prev.activeCallId === "dialing" ? { activeCallId: undefined } : {})
        }));
        throw outboundFailure;
      } finally {
        if (dialingWatchdog) {
          clearTimeout(dialingWatchdog);
        }
      }
    },
    [ensureInitialized, addCall, setActiveCallId, user]
  );

  const answerCall = useCallback(
    async (callId: string): Promise<void> => {
      const voipBridge = VoipBridge.getInstance();
      // VoIP: VoipBridge tracks it, OR we have SIP session in pendingSipSessions (SlimSipClient)
      const isVoip = voipBridge.isVoipCall(callId) || !!getSipSession(callId);
      if (isVoip) {
        voipBridge.handleCallAnswer(callId);
        return;
      }
      const sippyCup = await ensureInitialized();
      await sippyCup.answerCall(callId);
      setActiveCallId(callId);
    },
    [ensureInitialized, setActiveCallId]
  );

  /** Alias for answering VoIP call from in-app UI (same as answerCall for VoIP). */
  const answerVoipCallFromInApp = useCallback(
    async (callId: string) => answerCall(callId),
    [answerCall]
  );

  const answerCallViaCallKeep = useCallback(
    async (callId: string): Promise<void> => {
      const sippyCup = await ensureInitialized();
      await sippyCup.answerCallViaCallKeep(callId);
      // Don't set active call ID here - it will be set when CallKeep triggers the answer event
    },
    [ensureInitialized]
  );

  /**
   * Check for pending VoIP calls on app launch (iOS killed state)
   * When user answers from CallKit in killed state, the call data is stored in UserDefaults
   * We retrieve it here and establish the SIP session immediately
   */
  useEffect(() => {
    const checkPendingCalls = async () => {
      if (Platform.OS !== "ios") return;

      try {
        // @ts-ignore
        console.warn(
          `� [SP] ${new Date().toISOString()} checkPendingCalls | wakeupFlag=${!!global.pendingVoipPushWakeup}`
        );
        const pendingCalls = await PendingCallManager.getPendingCalls();

        if (Object.keys(pendingCalls).length === 0) {
          console.warn(
            `� [SP] ${new Date().toISOString()} checkPendingCalls: no pending calls`
          );
          return;
        }

        console.warn(
          `� [SP] ${new Date().toISOString()} checkPendingCalls: found ${
            Object.keys(pendingCalls).length
          } pending: ${Object.keys(pendingCalls).join(", ")}`
        );

        // Process each pending call
        for (const [callUuid, callData] of Object.entries(pendingCalls)) {
          console.warn(
            `� [SP] ${new Date().toISOString()} checkPendingCalls processing: uuid=${callUuid} ip=${
              callData.callerIp
            }`
          );

          // CRITICAL: Skip if NotificationManager is already handling this call via
          // didLoadWithEvents. Creating a second session here causes duplicate REGISTER.
          // @ts-ignore
          const alreadyHandled =
            global.pendingVoipPushWakeup ||
            // @ts-ignore
            (global.pendingSipSessions &&
              global.pendingSipSessions.has(callUuid));
          if (alreadyHandled) {
            console.warn(
              `� [SP] ${new Date().toISOString()} checkPendingCalls SKIPPED ${callUuid} (NM handling)`
            );
            await PendingCallManager.clearPendingCall(callUuid);
            continue;
          }

          // Establish SIP session only if NotificationManager didn't handle it
          if (callData.callerIp) {
            try {
              const sippyCup = await ensureInitialized();
              console.warn(
                `� [SP] ${new Date().toISOString()} checkPendingCalls establishing SIP session for ${callUuid}`
              );
              await sippyCup.establishInboundSession(
                callUuid,
                callData.callerIp
              );
              console.warn(
                `� [SP] ${new Date().toISOString()} checkPendingCalls ✅ SIP session established for ${callUuid}`
              );

              // Clear this pending call from storage
              await PendingCallManager.clearPendingCall(callUuid);
            } catch (error) {
              console.error(
                `� [SP] ${new Date().toISOString()} checkPendingCalls ❌ Failed for ${callUuid}:`,
                error
              );
            }
          }
        }
      } catch (error) {
        console.error(
          "🟪 [SoftphoneProvider] 📞 ❌ Error checking pending calls:",
          error
        );
      }
    };

    // Check for pending calls shortly after component mounts
    const timer = setTimeout(checkPendingCalls, 1000);
    return () => clearTimeout(timer);
  }, [ensureInitialized]);

  const hangupCall = useCallback(
    async (callId: string): Promise<void> => {
      console.warn(
        `📞 [SP] ${new Date().toISOString()} hangupCall called: callId=${callId}`
      );
      if (callId === "dialing") {
        outboundDialCancelledRef.current = true;
        setState((prev) =>
          prev.activeCallId === "dialing"
            ? { ...prev, activeCallId: undefined }
            : prev
        );
        androidCallFlowLog(
          "hangupCall",
          "cancel outbound dial (dialing placeholder)",
          {}
        );
        return;
      }
      const voipBridge = VoipBridge.getInstance();
      const sipSession = getSipSession(callId);

      if (voipBridge.isVoipCall(callId) || sipSession) {
        console.warn(
          `📞 [SP] ${new Date().toISOString()} hangupCall: VoIP path for callId=${callId}`
        );
        if (sipSession) {
          if (!sipSession.answered) {
            sipSession.sipRejectUserBusy();
          } else {
            sipSession.sipTerminate();
            removeSipSession(callId);
          }
        } else {
          removeSipSession(callId);
          // Killed-state answer: SIP may live only in headless task (see AndroidHandleSipCallHeadlessTask)
          const headless = (global as any).__headlessCallSessions?.get(callId);
          if (headless?.sessionManager && headless?.sessionId) {
            try {
              await headless.sessionManager.hangupCall(headless.sessionId);
            } catch {
              if (Platform.OS === "android") {
                const Notifications = NativeModules.VoxoConnectAndroidNotifications;
                Notifications?.requestHeadlessHangup?.(callId);
              }
            }
          } else if (Platform.OS === "android") {
            const Notifications = NativeModules.VoxoConnectAndroidNotifications;
            Notifications?.requestHeadlessHangup?.(callId);
          }
        }
        const sippyCup = await ensureInitialized();
        sippyCup.emit("callStateChanged", callId, CallState.ENDED);
        voipBridge.handleCallEnd(callId);
        return;
      }

      const sippyCup = await ensureInitialized();
      try {
        await sippyCup.hangupCall(callId);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        if (Platform.OS === "android" && message?.includes("No call found")) {
          const Notifications = NativeModules.VoxoConnectAndroidNotifications;
          Notifications?.requestHeadlessHangup?.(callId);
          sippyCup.emit("callStateChanged", callId, CallState.ENDED);
          voipBridge.handleCallEnd(callId);
          return;
        }
        throw e;
      }
    },
    [ensureInitialized]
  );

  // Android: handle hang up from ongoing call notification (foreground flow)
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = DeviceEventEmitter.addListener(
      "OngoingCallHangupRequested",
      (data: { callUuid?: string }) => {
        const callId = data?.callUuid;
        if (callId) hangupCall(callId).catch((e) => logger.error("hangupCall from notification failed:", e));
      }
    );
    return () => sub.remove();
  }, [hangupCall]);

  const callsRefForSecondIncoming = useRef(state.calls);
  useEffect(() => {
    callsRefForSecondIncoming.current = state.calls;
  });

  // Android: second incoming while on a call — end other legs then answer (custom notification)
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = DeviceEventEmitter.addListener(
      "SecondIncomingEndAndAccept",
      async (data: {
        incomingCallUuid?: string;
        incomingCallId?: string;
        callerName?: string;
      }) => {
        const incomingCallId = data?.incomingCallId;
        const incomingCallUuid = data?.incomingCallUuid;
        if (!incomingCallId || !incomingCallUuid) return;

        const Notifications = NativeModules.VoxoConnectAndroidNotifications as {
          reportCallAnswered?: (uuid: string, name?: string) => void;
        };

        for (const [id, call] of Object.entries(callsRefForSecondIncoming.current)) {
          if (id === incomingCallId) continue;
          if (call.state === CallState.ENDED) continue;
          await hangupCall(id).catch(() => undefined);
        }

        try {
          const sippyCup = await ensureInitialized();
          const voipBridge = VoipBridge.getInstance();
          const isVoip =
            voipBridge.isVoipCall(incomingCallId) ||
            hasPendingSipSession(incomingCallId);
          if (isVoip) {
            voipBridge.handleCallAnswer(incomingCallId);
          } else {
            await sippyCup.answerCall(incomingCallId);
          }
          Notifications?.reportCallAnswered?.(
            incomingCallUuid,
            data.callerName
          );
        } catch (e) {
          logger.error("SecondIncomingEndAndAccept failed:", e);
        }
      }
    );
    return () => sub.remove();
  }, [hangupCall, ensureInitialized]);

  // Android: when headless/native reports call ended (e.g. killed-state accepted call ended remotely),
  // force JS state cleanup so InCallScreen closes and no ghost call remains.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = DeviceEventEmitter.addListener(
      "HeadlessCallEnded",
      (data: { callUuid?: string }) => {
        const callId = data?.callUuid;
        if (!callId) return;

        updateCall(callId, {
          state: CallState.ENDED,
          connected: false,
          endTime: new Date().toISOString()
        });
        removeSipSession(callId);
        VoipBridge.getInstance().handleCallEnd(callId);
      }
    );
    return () => sub.remove();
  }, [updateCall]);

  const resolveCallControlTarget = useCallback(
    (
      callId: string
    ): {
      recordKey: string;
      sipSessionId: string;
      callUuid?: string;
      headless?: HeadlessCallEntry;
    } => {
      const { callUuid: splitUuid, sipSessionId: splitSipId } =
        splitCompositeCallId(callId);
      const calls = stateRef.current.calls;
      const recordKey =
        resolveCallsRecordKey(calls, callId) ??
        resolveCallsRecordKey(calls, splitSipId) ??
        (splitUuid ? resolveCallsRecordKey(calls, splitUuid) : undefined) ??
        (calls[splitSipId] ? splitSipId : undefined) ??
        callId;
      const call = calls[recordKey];
      const callUuid = call?.callUuid ?? splitUuid;
      let sipSessionId =
        call?.sessionId && call.sessionId !== callUuid
          ? call.sessionId
          : splitSipId;

      const headlessMap = (global as {
        __headlessCallSessions?: Map<string, HeadlessCallEntry>;
      }).__headlessCallSessions;
      const headless =
        (callUuid && headlessMap?.get(callUuid)) ||
        headlessMap?.get(callId) ||
        headlessMap?.get(sipSessionId);
      if (headless?.sessionId) {
        sipSessionId = headless.sessionId;
      }

      const cup = sippyCupRef.current;
      if (cup && typeof cup.getCallState === "function") {
        const viaSip = cup.getCallState(sipSessionId) as CallInfo | undefined;
        if (viaSip?.id) sipSessionId = viaSip.id;
        else if (callUuid) {
          const viaUuid = cup.getCallState(callUuid) as CallInfo | undefined;
          if (viaUuid?.id) sipSessionId = viaUuid.id;
        }
      }

      return { recordKey, sipSessionId, callUuid, headless };
    },
    []
  );

  /** Prefer existing SessionManager during live calls — avoids re-REGISTER crash in kill-state. */
  const ensureSippyCupForCallControl = useCallback(
    async (forceRegisterForOutbound = false): Promise<SippyCup> => {
      const hasLive = hasAndroidSipActivity(
        stateRef.current.calls,
        sippyCupRef.current
      );
      if (sippyCupRef.current && hasLive) {
        await sippyCupRef.current.initialize();
        if (forceRegisterForOutbound) {
          await sippyCupRef.current.ensureRegisteredForOutbound();
          setState((prev) => ({
            ...prev,
            isInitialized: true,
            isRegistered: true
          }));
        }
        return sippyCupRef.current;
      }
      return ensureInitialized(forceRegisterForOutbound);
    },
    [ensureInitialized]
  );

  const holdCall = useCallback(
    async (callId: string): Promise<void> => {
      const { recordKey, sipSessionId, callUuid, headless } =
        resolveCallControlTarget(callId);
      const voipBridge = VoipBridge.getInstance();
      const sipSession =
        getSipSession(callId) ??
        (callUuid ? getSipSession(callUuid) : undefined) ??
        getSipSession(sipSessionId);
      const isVoip =
        voipBridge.isVoipCall(callId) ||
        (!!callUuid && voipBridge.isVoipCall(callUuid));
      console.warn(
        `[SP-MUTEHOLD] holdCall entry callId=${callId} resolvedSip=${sipSessionId} isVoip=${isVoip} hasSipSession=${!!sipSession} hasHeadless=${!!headless}`
      );

      if (isVoip || sipSession) {
        if (sipSession) {
          console.warn(`[SP-MUTEHOLD] holdCall → SlimSip sipHold callId=${callId}`);
          sipSession.sipHold();
          updateCall(recordKey, { isOnHold: true });
          sippyCupRef.current?.emit("callStateChanged", recordKey, CallState.HOLDING);
          return;
        }
        if (headless?.sessionManager && headless.sessionId) {
          try {
            console.warn(
              `[SP-MUTEHOLD] holdCall → headless SessionManager sipSessionId=${headless.sessionId}`
            );
            await headless.sessionManager.holdCall(headless.sessionId);
            updateCall(recordKey, { isOnHold: true });
            sippyCupRef.current?.emit(
              "callStateChanged",
              recordKey,
              CallState.HOLDING
            );
          } catch (e) {
            console.warn(`[SP-MUTEHOLD] holdCall headless failed callId=${callId}`, e);
          }
          return;
        }
        if (Platform.OS !== "android") {
          console.warn(
            `[SP-MUTEHOLD] holdCall VoIP branch NO-OP: no sipSession and no headless callId=${callId}`
          );
          return;
        }
      }

      const cup = sippyCupRef.current;
      if (cup) {
        try {
          console.warn(
            `[SP-MUTEHOLD] holdCall → SessionManager direct sipSessionId=${sipSessionId}`
          );
          await cup.holdCall(sipSessionId);
          updateCall(recordKey, { isOnHold: true });
          cup.emit("callStateChanged", recordKey, CallState.HOLDING);
          return;
        } catch (directErr) {
          console.warn(
            `[SP-MUTEHOLD] holdCall direct SessionManager failed`,
            directErr
          );
        }
      }

      console.warn(
        `[SP-MUTEHOLD] holdCall → SessionManager path ensureInitialized callId=${callId}`
      );
      const sippyCup = await ensureInitialized();
      await sippyCup.holdCall(sipSessionId);
      updateCall(recordKey, { isOnHold: true });
    },
    [ensureInitialized, updateCall, resolveCallControlTarget]
  );

  const unholdCall = useCallback(
    async (callId: string): Promise<void> => {
      const { recordKey, sipSessionId, callUuid, headless } =
        resolveCallControlTarget(callId);
      const voipBridge = VoipBridge.getInstance();
      const sipSession =
        getSipSession(callId) ??
        (callUuid ? getSipSession(callUuid) : undefined) ??
        getSipSession(sipSessionId);
      const isVoip =
        voipBridge.isVoipCall(callId) ||
        (!!callUuid && voipBridge.isVoipCall(callUuid));
      console.warn(
        `[SP-MUTEHOLD] unholdCall entry callId=${callId} resolvedSip=${sipSessionId} isVoip=${isVoip} hasSipSession=${!!sipSession}`
      );

      if (isVoip || sipSession) {
        if (sipSession) {
          console.warn(`[SP-MUTEHOLD] unholdCall → SlimSip sipUnhold callId=${callId}`);
          sipSession.sipUnhold();
          updateCall(recordKey, { isOnHold: false });
          setActiveCallId(recordKey);
          sippyCupRef.current?.emit("callStateChanged", recordKey, CallState.CONNECTED);
          return;
        }
        if (headless?.sessionManager && headless.sessionId) {
          try {
            await headless.sessionManager.unholdCall(headless.sessionId);
            updateCall(recordKey, { isOnHold: false });
            setActiveCallId(recordKey);
            sippyCupRef.current?.emit(
              "callStateChanged",
              recordKey,
              CallState.CONNECTED
            );
          } catch (e) {
            console.warn(`[SP-MUTEHOLD] unholdCall headless failed callId=${callId}`, e);
          }
          return;
        }
        if (Platform.OS !== "android") {
          return;
        }
      }

      const cup = sippyCupRef.current;
      if (cup) {
        try {
          await cup.unholdCall(sipSessionId);
          updateCall(recordKey, { isOnHold: false });
          setActiveCallId(recordKey);
          cup.emit("callStateChanged", recordKey, CallState.CONNECTED);
          return;
        } catch (directErr) {
          console.warn(
            `[SP-MUTEHOLD] unholdCall direct SessionManager failed`,
            directErr
          );
        }
      }

      const sippyCup = await ensureInitialized();
      await sippyCup.unholdCall(sipSessionId);
      updateCall(recordKey, { isOnHold: false });
      setActiveCallId(recordKey);
      sippyCup.emit("callStateChanged", recordKey, CallState.CONNECTED);
    },
    [ensureInitialized, updateCall, setActiveCallId, resolveCallControlTarget]
  );

  const muteCall = useCallback(
    async (callId: string): Promise<void> => {
      const { recordKey, sipSessionId, callUuid, headless } =
        resolveCallControlTarget(callId);
      const voipBridge = VoipBridge.getInstance();
      const sipSession =
        getSipSession(callId) ??
        (callUuid ? getSipSession(callUuid) : undefined) ??
        getSipSession(sipSessionId);
      const isVoip =
        voipBridge.isVoipCall(callId) ||
        (!!callUuid && voipBridge.isVoipCall(callUuid));
      console.warn(
        `[SP-MUTEHOLD] muteCall entry callId=${callId} resolvedSip=${sipSessionId} isVoip=${isVoip} hasSipSession=${!!sipSession} hasHeadless=${!!headless}`
      );

      if (isVoip || sipSession) {
        if (sipSession) {
          console.warn(`[SP-MUTEHOLD] muteCall → SlimSip webRTCmute callId=${callId}`);
          sipSession.webRTCmute();
          updateCall(recordKey, { isMuted: true });
          sippyCupRef.current?.emit("callMuted", recordKey);
          return;
        }
        if (headless?.sessionManager && headless.sessionId) {
          console.warn(
            `[SP-MUTEHOLD] muteCall → headless SessionManager sipSessionId=${headless.sessionId}`
          );
          await headless.sessionManager.muteCall(headless.sessionId);
          updateCall(recordKey, { isMuted: true });
          sippyCupRef.current?.emit("callMuted", recordKey);
          return;
        }
        if (Platform.OS !== "android") {
          console.warn(
            `[SP-MUTEHOLD] muteCall VoIP branch NO-OP: no sipSession and no headless callId=${callId}`
          );
          return;
        }
      }

      const cup = sippyCupRef.current;
      if (cup) {
        try {
          console.warn(
            `[SP-MUTEHOLD] muteCall → SessionManager direct sipSessionId=${sipSessionId}`
          );
          await cup.muteCall(sipSessionId);
          updateCall(recordKey, { isMuted: true });
          cup.emit("callMuted", recordKey);
          return;
        } catch (directErr) {
          console.warn(
            `[SP-MUTEHOLD] muteCall direct SessionManager failed`,
            directErr
          );
        }
      }

      console.warn(
        `[SP-MUTEHOLD] muteCall → SessionManager path callId=${callId}`
      );
      const sippyCup = await ensureSippyCupForCallControl(false);
      await sippyCup.muteCall(sipSessionId);
      updateCall(recordKey, { isMuted: true });
    },
    [ensureSippyCupForCallControl, updateCall, resolveCallControlTarget]
  );

  const unmuteCall = useCallback(
    async (callId: string): Promise<void> => {
      const { recordKey, sipSessionId, callUuid, headless } =
        resolveCallControlTarget(callId);
      const voipBridge = VoipBridge.getInstance();
      const sipSession =
        getSipSession(callId) ??
        (callUuid ? getSipSession(callUuid) : undefined) ??
        getSipSession(sipSessionId);
      const isVoip =
        voipBridge.isVoipCall(callId) ||
        (!!callUuid && voipBridge.isVoipCall(callUuid));
      console.warn(
        `[SP-MUTEHOLD] unmuteCall entry callId=${callId} resolvedSip=${sipSessionId} isVoip=${isVoip} hasSipSession=${!!sipSession}`
      );

      if (isVoip || sipSession) {
        if (sipSession) {
          console.warn(`[SP-MUTEHOLD] unmuteCall → SlimSip webRTCunmute callId=${callId}`);
          sipSession.webRTCunmute();
          updateCall(recordKey, { isMuted: false });
          sippyCupRef.current?.emit("callUnmuted", recordKey);
          return;
        }
        if (headless?.sessionManager && headless.sessionId) {
          console.warn(
            `[SP-MUTEHOLD] unmuteCall → headless SessionManager sipSessionId=${headless.sessionId}`
          );
          await headless.sessionManager.unmuteCall(headless.sessionId);
          updateCall(recordKey, { isMuted: false });
          sippyCupRef.current?.emit("callUnmuted", recordKey);
          return;
        }
        if (Platform.OS !== "android") {
          return;
        }
      }

      const cup = sippyCupRef.current;
      if (cup) {
        try {
          await cup.unmuteCall(sipSessionId);
          updateCall(recordKey, { isMuted: false });
          cup.emit("callUnmuted", recordKey);
          return;
        } catch (directErr) {
          console.warn(
            `[SP-MUTEHOLD] unmuteCall direct SessionManager failed`,
            directErr
          );
        }
      }

      const sippyCup = await ensureSippyCupForCallControl(false);
      await sippyCup.unmuteCall(sipSessionId);
      updateCall(recordKey, { isMuted: false });
    },
    [ensureSippyCupForCallControl, updateCall, resolveCallControlTarget]
  );

  const setSpeaker = useCallback(
    async (callId: string, enabled: boolean): Promise<void> => {
      const { recordKey, sipSessionId, callUuid, headless } =
        resolveCallControlTarget(callId);
      const voipBridge = VoipBridge.getInstance();
      const sipSession =
        getSipSession(callId) ??
        (callUuid ? getSipSession(callUuid) : undefined) ??
        getSipSession(sipSessionId);
      const isVoip =
        voipBridge.isVoipCall(callId) ||
        (!!callUuid && voipBridge.isVoipCall(callUuid));
      const routeCallId = callUuid ?? sipSessionId;

      console.warn(
        `[SP-SPEAKER] setSpeaker callId=${callId} resolvedSip=${sipSessionId} callUuid=${callUuid ?? "?"} enabled=${enabled} isVoip=${isVoip} hasSipSession=${!!sipSession} hasHeadless=${!!headless}`
      );

      if (isVoip || sipSession) {
        if (Platform.OS === "android") {
          applyCallSpeakerAndroid(
            enabled,
            "[SP-SPEAKER] VoIP",
            routeCallId,
            callUuid
          );
        } else {
          InCallManager.setForceSpeakerphoneOn(enabled);
        }
        updateCall(recordKey, { isSpeakerOn: enabled });
        return;
      }

      if (headless?.sessionManager && headless.sessionId) {
        try {
          await headless.sessionManager.setSpeaker(headless.sessionId, enabled);
          updateCall(recordKey, { isSpeakerOn: enabled });
          return;
        } catch (directErr) {
          console.warn(
            `[SP-SPEAKER] headless SessionManager.setSpeaker failed`,
            directErr
          );
        }
      }

      const cup = sippyCupRef.current;
      if (cup) {
        try {
          await cup.setSpeaker(sipSessionId, enabled);
          updateCall(recordKey, { isSpeakerOn: enabled });
          return;
        } catch (directErr) {
          console.warn(
            `[SP-SPEAKER] direct SessionManager.setSpeaker failed`,
            directErr
          );
        }
      }

      const sippyCup = await ensureSippyCupForCallControl(false);
      await sippyCup.setSpeaker(sipSessionId, enabled);
      updateCall(recordKey, { isSpeakerOn: enabled });
    },
    [ensureSippyCupForCallControl, updateCall, resolveCallControlTarget]
  );

  const sendDTMF = useCallback(
    async (callId: string, tones: string): Promise<void> => {
      playDtmfSidetoneAndroid(tones);
      const voipBridge = VoipBridge.getInstance();
      const sipSession = getSipSession(callId);

      // VoIP call (SlimSipClient) — iOS & Android
      if (voipBridge.isVoipCall(callId) || sipSession) {
        if (sipSession && tones) {
          sipSession.sendSipInfoDtmf(tones);
        }
        return;
      }

      const sippyCup = await ensureInitialized();
      await sippyCup.sendDTMF(callId, tones);
    },
    [ensureInitialized]
  );

  const transferCall = useCallback(
    async (callId: string, target: string): Promise<void> => {
      try {
        const { recordKey, sipSessionId, callUuid } =
          resolveCallControlTarget(callId);
        const voipBridge = VoipBridge.getInstance();
        const sipSession =
          getSipSession(callId) ??
          (callUuid ? getSipSession(callUuid) : undefined) ??
          getSipSession(sipSessionId);
        if (
          voipBridge.isVoipCall(callId) ||
          (callUuid && voipBridge.isVoipCall(callUuid)) ||
          sipSession
        ) {
          if (sipSession) {
            await sipSession.blindTransfer(target.replace(/\D/g, ""));
            sippyCupRef.current?.emit(
              "callStateChanged",
              recordKey,
              CallState.ENDED
            );
            voipBridge.handleCallEnd(callUuid ?? callId);
            removeSipSession(callUuid ?? callId);
          }
          return;
        }

        const cup = sippyCupRef.current;
        if (cup) {
          try {
            await cup.transfer(sipSessionId, target);
            return;
          } catch (directErr) {
            logger.warn("[TRANSFER_TRACE] direct transfer failed, retrying", {
              directErr
            });
          }
        }

        const sippyCup = await ensureSippyCupForCallControl(false);
        await sippyCup.transfer(sipSessionId, target);
      } catch (error) {
        logger.error("[TRANSFER_TRACE] transferCall failed", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          callId,
          target
        });
        throw error;
      }
    },
    [ensureSippyCupForCallControl, resolveCallControlTarget]
  );

  const startAttendedTransfer = useCallback(
    async (
      callId: string,
      target: string,
      options?: { displayName?: string }
    ): Promise<string> => {
      const displayName = options?.displayName?.trim() || undefined;
      const voipBridge = VoipBridge.getInstance();
      const parentSipSession = getSipSession(callId);
      const isVoip =
        voipBridge.isVoipCall(callId) || !!parentSipSession;

      // VoIP path: use SlimSipClient for child call
      if (isVoip && parentSipSession) {
        const originalCall = state.calls[callId];
        if (!originalCall) {
          logger.error("startAttendedTransfer: Original call not found", {
            callId,
            availableCallIds: Object.keys(state.calls)
          });
          throw new Error("Cannot start transfer - original call not found");
        }
        const transferCallUuid = uuidv4();
        const sipSettings = buildSlimSipSettings(
          transferCallUuid,
          "outbound"
        );
        if (!sipSettings) {
          throw new Error("Cannot build SIP settings - user not logged in");
        }
        parentSipSession.sipHold();
        updateCall(callId, { isOnHold: true });
        const transferClient = new SlimSipClient(sipSettings);
        const transferSession = await transferClient.call(
          target.replace(/\D/g, ""),
          transferCallUuid
        );
        storeSipSession(transferCallUuid, transferSession, transferClient);
        setState((prev) => ({
          ...prev,
          calls: {
            ...prev.calls,
            [callId]: {
              ...prev.calls[callId],
              childSessionId: transferCallUuid
            },
            [transferCallUuid]: {
              sessionId: transferCallUuid,
              callId: transferCallUuid,
              parentSessionId: callId,
              state: CallState.OUTGOING,
              direction: CallDirection.OUTGOING,
              remoteDisplayName: displayName || target,
              remoteUri: target,
              ...(displayName ? { contactDisplayName: displayName } : {}),
              remoteParty: {
                cidNum: target,
                cidName: displayName || target
              },
              startTime: new Date().toISOString(),
              isMuted: false,
              isOnHold: false,
              isSpeakerOn: false,
              isEmergency: false,
              connected: false,
              recording: false,
              conferencing: false,
              attendedTransfer: false,
              childSessionId: undefined,
              totalCallDuration: 0,
              currentHoldDuration: 0,
              totalHoldDuration: 0,
              mutedConferenceParticipants: []
            }
          }
        }));
        transferSession.established().then(() => {
          updateCall(transferCallUuid, {
            state: CallState.CONNECTED,
            connected: true,
            answerTime: new Date().toISOString()
          });
          sippyCupRef.current?.emit(
            "callStateChanged",
            transferCallUuid,
            CallState.CONNECTED
          );
        }).catch(() => {});
        return transferCallUuid;
      }

      // SessionManager path (Android FCM / kill-state answered)
      const { recordKey, sipSessionId } = resolveCallControlTarget(callId);
      const sippyCup = await ensureSippyCupForCallControl(true);
      const originalCall =
        stateRef.current.calls[recordKey] ??
        stateRef.current.calls[callId];
      logger.debug("startAttendedTransfer: Original call lookup", {
        callId,
        recordKey,
        sipSessionId,
        callFound: !!originalCall,
        isOnHold: originalCall?.isOnHold
      });

      if (!originalCall) {
        logger.error("startAttendedTransfer: Original call not found", {
          callId,
          recordKey,
          availableCallIds: Object.keys(stateRef.current.calls)
        });
        throw new Error("Cannot start transfer - original call not found");
      }

      try {
        logger.debug("startAttendedTransfer: Starting SIP transfer operation", {
          callId,
          recordKey,
          sipSessionId,
          target,
          displayName: displayName ?? null
        });

        if (displayName) {
          pendingOutgoingContactMetadataRef.current = {
            displayName
          };
        }

        if (!originalCall.isOnHold) {
          await sippyCup.holdCall(sipSessionId);
          updateCall(recordKey, { isOnHold: true });
        }

        const transferCallUuid = uuidv4();
        const transferOptions: CallOptions = {
          callUuid: transferCallUuid,
          ...(displayName ? { displayName } : {})
        };

        const transferCallId = await sippyCup.makeCall(target, transferOptions);

        if (displayName) {
          updateCall(transferCallId, { contactDisplayName: displayName });
        }

        const parentBefore = stateRef.current.calls[recordKey];
        logger.warn("[TRANSFER_TRACE][PAIR] startAttendedTransfer before link setState", {
          callId,
          recordKey,
          transferCallId,
          parentHadChildSessionId: parentBefore?.childSessionId,
          childAlreadyInCalls: transferCallId in stateRef.current.calls
        });

        // Link parent↔child immediately so UI (e.g. TransferStateDrawer) sees a pair on first paint.
        // Merge with existing child row from makeCall handlers, or add a placeholder until events enrich it.
        setState((prev) => {
          const parentRow = prev.calls[recordKey] ?? prev.calls[callId];
          const updatedCalls = {
            ...prev.calls,
            [recordKey]: {
              ...parentRow,
              childSessionId: transferCallId
            },
            [transferCallId]: prev.calls[transferCallId]
              ? {
                  ...prev.calls[transferCallId],
                  parentSessionId: recordKey
                }
              : {
                  sessionId: transferCallId,
                  callId: transferCallId,
                  parentSessionId: recordKey,
                  state: CallState.OUTGOING,
                  direction: CallDirection.OUTGOING,
                  remoteDisplayName: displayName || target,
                  remoteUri: target,
                  ...(displayName ? { contactDisplayName: displayName } : {}),
                  remoteParty: {
                    cidNum: target,
                    cidName: displayName || target
                  },
                  startTime: new Date().toISOString(),
                  isMuted: false,
                  isOnHold: false,
                  isSpeakerOn: false,
                  isEmergency: false,
                  connected: false,
                  recording: false,
                  conferencing: false,
                  attendedTransfer: false,
                  childSessionId: undefined,
                  totalCallDuration: 0,
                  currentHoldDuration: 0,
                  totalHoldDuration: 0,
                  mutedConferenceParticipants: []
                }
          };
          return {
            ...prev,
            calls: updatedCalls
          };
        });

        setTimeout(() => {
          const p = stateRef.current.calls[callId];
          const c = stateRef.current.calls[transferCallId];
          logger.warn("[TRANSFER_TRACE][PAIR] startAttendedTransfer after commit", {
            callId,
            transferCallId,
            hasParentChildLink: p?.childSessionId === transferCallId,
            childExists: !!c,
            childState: c?.state,
            parentState: p?.state
          });
        }, 0);

        logger.debug("startAttendedTransfer: Transfer process completed", {
          originalCallId: callId,
          transferCallId,
          target,
          displayName: displayName ?? null,
          immediateStateUpdate: true
        });

        return transferCallId;
      } catch (error) {
        logger.error("startAttendedTransfer: Failed to start transfer", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          callId,
          target,
          displayName: displayName ?? null
        });
        throw error;
      }
    },
    [ensureSippyCupForCallControl, updateCall, resolveCallControlTarget]
  );

  const completeAttendedTransfer = useCallback(async (): Promise<void> => {
    isCompletingAttendedTransferRef.current = true;
    const liveTransferPair = Object.values(stateRef.current.calls).find(
      (call) => {
        if (!call.childSessionId || call.state === CallState.ENDED) return false;
        const child = stateRef.current.calls[call.childSessionId];
        if (!child || child.state === CallState.ENDED) return false;
        return true;
      }
    );

    if (!liveTransferPair?.childSessionId) {
      logger.warn("completeAttendedTransfer: No live transfer pair found", {
        callIds: Object.keys(stateRef.current.calls)
      });
      isCompletingAttendedTransferRef.current = false;
      return;
    }

    const parentCall = liveTransferPair;
    const childCall = stateRef.current.calls[parentCall.childSessionId];
    if (!childCall) return;

    const clearTransferLinks = () => {
      updateCall(parentCall.sessionId, { childSessionId: undefined });
      updateCall(childCall.sessionId, {
        parentSessionId: undefined,
        attendedTransfer: false
      });
    };

    const teardownLocalLegsAfterHandoff = () => {
      const endTime = new Date().toISOString();
      updateCall(parentCall.sessionId, {
        state: CallState.ENDED,
        connected: false,
        endTime
      });
      updateCall(childCall.sessionId, {
        state: CallState.ENDED,
        connected: false,
        endTime
      });
      setState((prev) => ({ ...prev, activeCallId: undefined }));
      setTimeout(() => removeCall(parentCall.sessionId), 250);
      setTimeout(() => removeCall(childCall.sessionId), 350);
      setTimeout(() => {
        isCompletingAttendedTransferRef.current = false;
      }, 1200);
    };

    const parentSipSession = getSipSession(parentCall.sessionId);
    const childSipSession = getSipSession(childCall.sessionId);
    if (parentSipSession && childSipSession) {
      logger.debug("completeAttendedTransfer: VoIP handoff path", {
        parentSessionId: parentCall.sessionId,
        childSessionId: childCall.sessionId
      });
      try {
        await parentSipSession.attendedTransferTo(childSipSession);
        logger.debug("completeAttendedTransfer: REFER accepted");
        parentSipSession.sipTerminate();
        // Delay child termination so the backend can complete the REFER handoff
        // before we tear down the child leg. Prevents third party and original caller
        // from being disconnected prematurely.
        await new Promise((resolve) => setTimeout(resolve, 800));
        childSipSession.sipTerminate();
        clearTransferLinks();
        teardownLocalLegsAfterHandoff();
        logger.debug("completeAttendedTransfer: VoIP handoff completed");
      } catch (err) {
        logger.error("[TRANSFER_TRACE] completeAttendedTransfer: VoIP REFER failed", {
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
          parentSessionId: parentCall.sessionId,
          childSessionId: childCall.sessionId
        });
        isCompletingAttendedTransferRef.current = false;
        throw err;
      }
    } else {
      try {
        const sippyCup = await ensureInitialized();
        logger.warn("[TRANSFER_TRACE] completeAttendedTransfer SessionManager path", {
          parentSessionId: parentCall.sessionId,
          childSessionId: childCall.sessionId
        });
        await sippyCup.completeAttendedTransfer(
          parentCall.sessionId,
          childCall.sessionId,
          { terminateLocalLegs: true }
        );
        clearTransferLinks();
        teardownLocalLegsAfterHandoff();
      } catch (err) {
        logger.error("[TRANSFER_TRACE] completeAttendedTransfer SessionManager failed", {
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
          parentSessionId: parentCall.sessionId,
          childSessionId: childCall.sessionId
        });
        isCompletingAttendedTransferRef.current = false;
        throw err;
      }
    }
  }, [ensureInitialized, removeCall, updateCall]);

  const swapAttendedTransferCalls = useCallback(
    async (originalCallId: string, transferCallId: string): Promise<void> => {
      if (isSwappingAttendedTransferRef.current) {
        logger.warn(
          "swapAttendedTransferCalls: Swap already in progress, ignoring tap",
          { originalCallId, transferCallId }
        );
        return;
      }
      isSwappingAttendedTransferRef.current = true;
      logger.debug("swapAttendedTransferCalls: Starting call swap", {
        originalCallId,
        transferCallId,
        timestamp: new Date().toISOString()
      });

      return new Promise<void>((resolve, reject) => {
        setState((currentState) => {
          (async () => {
            let previousActiveCall: string | undefined = currentState.activeCallId;
            try {
              // Validate both calls exist before attempting swap
              const originalCall = currentState.calls[originalCallId];
              const transferCall = currentState.calls[transferCallId];

              logger.debug("swapAttendedTransferCalls: Call states", {
                originalCall: {
                  exists: !!originalCall,
                  isOnHold: originalCall?.isOnHold
                },
                transferCall: {
                  exists: !!transferCall,
                  isOnHold: transferCall?.isOnHold
                },
                totalCalls: Object.keys(currentState.calls).length
              });

              if (!originalCall || !transferCall) {
                logger.warn(
                  "swapAttendedTransferCalls: Cannot swap - one or both calls no longer exist",
                  {
                    originalCallExists: !!originalCall,
                    transferCallExists: !!transferCall,
                    originalCallId,
                    transferCallId
                  }
                );
                isSwappingAttendedTransferRef.current = false;
                resolve();
                return;
              }

              // Determine active call from state source-of-truth first.
              const stateActiveCall = currentState.activeCallId;
              const currentActiveCall =
                stateActiveCall === originalCallId ||
                stateActiveCall === transferCallId
                  ? stateActiveCall
                  : !originalCall.isOnHold
                  ? originalCallId
                  : transferCallId;
              const newActiveCall =
                currentActiveCall === originalCallId
                  ? transferCallId
                  : originalCallId;
              previousActiveCall = stateActiveCall;
              const otherLeg =
                newActiveCall === originalCallId ? transferCallId : originalCallId;

              logger.debug(
                "swapAttendedTransferCalls: Determined call swap direction",
                {
                  currentActiveCall,
                  newActiveCall,
                  previousActiveCall,
                  originalCallOnHold: originalCall.isOnHold,
                  transferCallOnHold: transferCall.isOnHold
                }
              );

              // Update active call optimistically - the actual swap will be handled by hold/unhold events
              setState((prev) => {
                logger.debug(
                  "swapAttendedTransferCalls: Updating state with new active call",
                  {
                    previousActiveCall,
                    newActiveCall
                  }
                );

                return {
                  ...prev,
                  activeCallId: newActiveCall
                };
              });

              // Perform the actual SIP swap using Provider's holdCall/unholdCall
              // (routes to SipSession for VoIP, sippyCup for SessionManager)
              logger.debug(
                "swapAttendedTransferCalls: Executing SIP swap operation"
              );
              // Ordered operations by target leg prevent hold-flag drift over multiple swaps.
              await holdCall(otherLeg);
              await unholdCall(newActiveCall);
              logger.debug(
                "swapAttendedTransferCalls: SIP swap completed successfully",
                {
                  originalCallId,
                  transferCallId,
                  newActiveCall
                }
              );

              // Reconcile active call to the intended target after SIP settles.
              setState((prev) => ({
                ...prev,
                activeCallId: newActiveCall
              }));

              isSwappingAttendedTransferRef.current = false;
              resolve();
            } catch (error) {
              logger.error(
                "swapAttendedTransferCalls: Failed to perform SIP swap",
                {
                  error: error instanceof Error ? error.message : String(error),
                  stack: error instanceof Error ? error.stack : undefined,
                  originalCallId,
                  transferCallId
                }
              );
              setState((prev) => ({
                ...prev,
                activeCallId:
                  prev.activeCallId === transferCallId ||
                  prev.activeCallId === originalCallId
                    ? previousActiveCall
                    : prev.activeCallId
              }));
              isSwappingAttendedTransferRef.current = false;
              reject(error);
            }
          })();

          return currentState;
        });
      });
    },
    [holdCall, unholdCall]
  );

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: undefined }));
  }, []);

  // Additional methods to match the original interface
  const setConfig = useCallback((config: SipConfig) => {
    setState((prev) => ({ ...prev, config }));
  }, []);

  const cleanup = useCallback(async () => {
    return new Promise<void>((resolve) => {
      setState((currentState) => {
        (async () => {
          const cup = sippyCupRef.current;
          sippyCupRef.current = null;
          if (cup) {
            if (currentState.isRegistered) {
              await cup.unregister().catch(() => {});
            }
            await cup.dispose().catch(() => {});
          }
          PendingCallManager.clearAllPendingCalls().catch(() => {});
          setState({
            isInitialized: false,
            isInitializing: false,
            isRegistered: false,
            isRegistering: false,
            config: null,
            calls: {},
            activeCallId: undefined,
            error: undefined
          });
          resolve();
        })();
        return currentState;
      });
    });
  }, []);

  // Stub methods for compatibility - should be refactored out
  const setCurrentCall = useCallback(
    async (call: ContextCallInfo) => {
      if (call) {
        setActiveCallId(call.sessionId);
      }
    },
    [setActiveCallId]
  );

  const setCurrentCallConnected = useCallback(
    (call: ContextCallInfo) => {
      updateCall(call.sessionId, { connected: true });
    },
    [updateCall]
  );

  const updateCurrentCallData = useCallback(
    (data: RemoteParty) => {
      setState((currentState) => {
        if (currentState.activeCallId) {
          updateCall(currentState.activeCallId, {
            remoteParty: data,
            remoteDisplayName: data.cidName || data.cidNum
          });
        }
        return currentState;
      });
    },
    [updateCall]
  );

  const clearCurrentCall = useCallback(() => {
    setActiveCallId(undefined);
  }, [setActiveCallId]);

  const addIncomingCall = useCallback(
    (call: ContextCallInfo) => {
      addCall(call);
    },
    [addCall]
  );

  const removeIncomingCall = useCallback(
    (sessionId: string) => {
      removeCall(sessionId);
    },
    [removeCall]
  );

  const addCallOnHold = useCallback(
    (call: ContextCallInfo) => {
      updateCall(call.sessionId, { isOnHold: true });
    },
    [updateCall]
  );

  const removeCallOnHold = useCallback(
    (sessionId: string) => {
      updateCall(sessionId, { isOnHold: false });
    },
    [updateCall]
  );

  const holdCurrentCall = useCallback(async () => {
    return new Promise<void>((resolve, reject) => {
      setState((currentState) => {
        (async () => {
          try {
            if (currentState.activeCallId) {
              await holdCall(currentState.activeCallId);
              resolve();
            } else {
              resolve(); // No active call, nothing to hold
            }
          } catch (error) {
            reject(error);
          }
        })();
        return currentState;
      });
    });
  }, [holdCall]);

  const getCallById = useCallback((sessionId: string) => {
    const key = resolveCallsRecordKey(stateRef.current.calls, sessionId);
    if (key) return stateRef.current.calls[key];
    return stateRef.current.calls[sessionId];
  }, []);

  const getChildCallBySessionId = useCallback((sessionId: string) => {
    const parentCall = stateRef.current.calls[sessionId];
    if (!parentCall?.childSessionId) return null;
    return stateRef.current.calls[parentCall.childSessionId] || null;
  }, []);

  const getParentCallBySessionId = useCallback((sessionId: string) => {
    const childCall = stateRef.current.calls[sessionId];
    if (!childCall?.parentSessionId) return undefined;
    return stateRef.current.calls[childCall.parentSessionId];
  }, []);

  const updateCallDurations = useCallback((_seconds: number) => {
    // This should be handled by a separate timer/interval
    // For now, just a stub
  }, []);

  const setConferencing = useCallback(
    (conferenceId: string) => {
      // Use setState callback to always read the latest state
      setState((currentState) => {
        if (currentState.activeCallId) {
          logger.debug("Setting conference state", {
            activeCallId: currentState.activeCallId,
            conferenceId,
            previousState: currentState.calls[currentState.activeCallId]
          });

          updateCall(currentState.activeCallId, {
            conferencing: true,
            conferenceId
          });
        } else {
          logger.warn("Cannot set conferencing: no active call", {
            callsCount: Object.keys(currentState.calls).length
          });
        }

        return currentState;
      });
    },
    [updateCall]
  );

  const startConference = useCallback(
    async (childCall: ContextCallInfo, parentCall: ContextCallInfo) => {
      if (!accessToken) {
        logger.error("Cannot start conference: no access token");
        return;
      }

      return new Promise<void>((resolve, reject) => {
        setState((currentState) => {
          (async () => {
            try {
              if (!currentState.activeCallId) {
                logger.error("Cannot start conference: no active call");
                reject(new Error("No active call"));
                return;
              }

              const sippyCup = await ensureInitialized();

              const currentCall = currentState.calls[currentState.activeCallId];
              if (!currentCall) {
                logger.error("Cannot start conference: active call not found");
                reject(new Error("Active call not found"));
                return;
              }

              const currentSipSession = getSipSession(currentCall.sessionId);
              let currentCallResolvedId = resolveBackendCallId(
                currentCall,
                currentSipSession,
                sippyCup.getServerCallIdForApi(currentCall.sessionId)
              );
              if (
                !currentCallResolvedId ||
                currentCallResolvedId === currentCall.sessionId
              ) {
                currentCallResolvedId =
                  (await hydrateCallBackendId(currentCall.sessionId, 1500)) ||
                  currentCallResolvedId;
              }
              if (
                currentCallResolvedId &&
                currentCallResolvedId !== currentCall.callId
              ) {
                updateCall(currentCall.sessionId, {
                  callId: currentCallResolvedId
                });
              }

              let parentCallId = parentCall.callId;
              let childCallId = childCall.callId;
              const hydratedParentCallId =
                (await hydrateCallBackendId(parentCall.sessionId, 1500)) ||
                parentCallId;
              const hydratedChildCallId =
                (await hydrateCallBackendId(childCall.sessionId, 1500)) ||
                childCallId;
              if (
                hydratedParentCallId &&
                hydratedParentCallId !== parentCallId &&
                hydratedParentCallId !== parentCall.sessionId
              ) {
                parentCallId = hydratedParentCallId;
                updateCall(parentCall.sessionId, { callId: parentCallId });
              }
              if (
                hydratedChildCallId &&
                hydratedChildCallId !== childCallId &&
                hydratedChildCallId !== childCall.sessionId
              ) {
                childCallId = hydratedChildCallId;
                updateCall(childCall.sessionId, { callId: childCallId });
              }

              const mergeAttempts = buildConferenceMergeAttempts({
                activeCallId: currentCallResolvedId,
                parentCallId,
                childCallId
              });

              if (
                !currentCallResolvedId ||
                mergeAttempts.length === 0
              ) {
                logger.error("Invalid conference merge id ordering", {
                  currentCallId: currentCallResolvedId,
                  parentCallId,
                  childCallId,
                  mergeAttemptsCount: mergeAttempts.length
                });
                reject(new Error("Invalid merge call mapping"));
                return;
              }

              let mergeSession: { conferenceId: string } | void | undefined;
              let lastMergeError: unknown;

              for (let i = 0; i < mergeAttempts.length; i++) {
                const attempt = mergeAttempts[i];
                const attemptIndex = i + 1;
                const isFinalAttempt = i === mergeAttempts.length - 1;

                try {
                  mergeSession = await sippyCup.attendedTransferMergeNew(
                    attempt.callId,
                    attempt.mergeCallId,
                    accessToken
                  );
                  break;
                } catch (error) {
                  lastMergeError = error;
                  const statusCode = getErrorStatusCode(error);
                  const canRetry =
                    !isFinalAttempt && isRetriableConferenceMergeError(error);

                  logger.warn("startConference: merge attempt failed", {
                    attempt: attemptIndex,
                    totalAttempts: mergeAttempts.length,
                    strategy: attempt.strategy,
                    callId: attempt.callId,
                    mergeCallId: attempt.mergeCallId,
                    statusCode,
                    message: (error as any)?.message,
                    willRetryWithSwappedIds: canRetry
                  });

                  if (!canRetry) {
                    throw error;
                  }
                }
              }

              if (!mergeSession) {
                throw lastMergeError || new Error("Failed to start conference");
              }

              if (mergeSession) {
                updateCall(parentCall.sessionId, {
                  conferencing: true,
                  conferenceId: mergeSession.conferenceId
                });
                updateCall(childCall.sessionId, {
                  conferencing: true,
                  conferenceId: mergeSession.conferenceId
                });
                setConferencing(mergeSession.conferenceId);
              }

              resolve();
            } catch (error) {
              logger.error("Failed to start conference:", error);
              reject(error);
            }
          })();

          return currentState;
        });
      });
    },
    [
      accessToken,
      ensureInitialized,
      hydrateCallBackendId,
      setConferencing,
      updateCall
    ]
  );

  const addParticipantToConferenceCall = useCallback(
    async (childCall: ContextCallInfo, parentCall: ContextCallInfo) => {
      if (!accessToken) {
        logger.error("Cannot add participant: no access token");
        return;
      }

      return new Promise<void>((resolve, reject) => {
        setState((currentState) => {
          (async () => {
            try {
              if (!currentState.activeCallId) {
                logger.error("Cannot add participant: no active call");
                reject(new Error("No active call"));
                return;
              }

              const sippyCup = await ensureInitialized();
              const currentCall = currentState.calls[currentState.activeCallId];

              if (!currentCall) {
                logger.error("Cannot add participant: active call not found");
                reject(new Error("Active call not found"));
                return;
              }

              const currentSipSession = getSipSession(currentCall.sessionId);
              let currentCallResolvedId = resolveBackendCallId(
                currentCall,
                currentSipSession,
                sippyCup.getServerCallIdForApi(currentCall.sessionId)
              );
              if (
                !currentCallResolvedId ||
                currentCallResolvedId === currentCall.sessionId
              ) {
                currentCallResolvedId =
                  (await hydrateCallBackendId(currentCall.sessionId, 1500)) ||
                  currentCallResolvedId;
              }
              if (
                currentCallResolvedId &&
                currentCallResolvedId !== currentCall.callId
              ) {
                updateCall(currentCall.sessionId, {
                  callId: currentCallResolvedId
                });
              }
              if (
                !currentCallResolvedId ||
                currentCallResolvedId === currentCall.sessionId
              ) {
                reject(
                  new Error(
                    "Cannot add participant: active call backend ID is not ready"
                  )
                );
                return;
              }

              let parentResolvedId = resolveBackendCallId(
                parentCall,
                getSipSession(parentCall.sessionId),
                sippyCup.getServerCallIdForApi(parentCall.sessionId)
              );
              let childResolvedId = resolveBackendCallId(
                childCall,
                getSipSession(childCall.sessionId),
                sippyCup.getServerCallIdForApi(childCall.sessionId)
              );
              if (
                !parentResolvedId ||
                parentResolvedId === parentCall.sessionId
              ) {
                parentResolvedId =
                  (await hydrateCallBackendId(parentCall.sessionId, 1500)) ||
                  parentResolvedId;
              }
              if (
                !childResolvedId ||
                childResolvedId === childCall.sessionId
              ) {
                childResolvedId =
                  (await hydrateCallBackendId(childCall.sessionId, 1500)) ||
                  childResolvedId;
              }
              if (parentResolvedId && parentResolvedId !== parentCall.callId) {
                updateCall(parentCall.sessionId, { callId: parentResolvedId });
              }
              if (childResolvedId && childResolvedId !== childCall.callId) {
                updateCall(childCall.sessionId, { callId: childResolvedId });
              }
              if (
                !parentResolvedId ||
                !childResolvedId ||
                parentResolvedId === parentCall.sessionId ||
                childResolvedId === childCall.sessionId
              ) {
                reject(
                  new Error(
                    "Cannot add participant: parent or child backend ID is not ready"
                  )
                );
                return;
              }

              logger.debug("Adding participant to conference", {
                activeCallId: currentState.activeCallId,
                parentCallId: parentResolvedId,
                childCallId: childResolvedId,
                conferenceId: parentCall.conferenceId
              });

              if (currentCallResolvedId !== parentResolvedId) {
                await sippyCup.addParticipantToConference(
                  parentCall.conferenceId!,
                  currentCallResolvedId,
                  accessToken
                );

                if (parentCall.currentHoldDuration === 0) {
                  await unholdCall(parentCall.sessionId);
                  setActiveCallId(parentCall.sessionId);
                }
              } else {
                await sippyCup.addParticipantToConference(
                  parentCall.conferenceId!,
                  childResolvedId,
                  accessToken
                );
              }

              updateCall(parentCall.sessionId, {
                conferencing: true,
                conferenceId: parentCall.conferenceId
              });
              updateCall(childCall.sessionId, {
                conferencing: true,
                conferenceId: parentCall.conferenceId
              });

              resolve();
            } catch (error) {
              logger.error("Failed to add participant to conference:", error);
              reject(error);
            }
          })();

          return currentState;
        });
      });
    },
    [
      accessToken,
      ensureInitialized,
      hydrateCallBackendId,
      setActiveCallId,
      unholdCall,
      updateCall
    ]
  );

  const mergeAttendedTransfer = useCallback(
    async (
      mode: "conferenceMerge" | "attendedTransfer" = "conferenceMerge"
    ) => {
      // Use setState callback to always read the latest state
      // This prevents stale closure issues when called from drawers/modals
      return new Promise<void>((resolve, reject) => {
        setState((currentState) => {
          // Perform merge asynchronously but read state synchronously
          (async () => {
            try {
              if (!currentState.activeCallId) {
                logger.warn("Cannot merge: no active call", {
                  callsCount: Object.keys(currentState.calls).length
                });
                reject(new Error("No active call"));
                return;
              }

              const currentCall = currentState.calls[currentState.activeCallId];
              if (!currentCall) {
                logger.warn("Cannot merge: active call not found", {
                  activeCallId: currentState.activeCallId,
                  availableCalls: Object.keys(currentState.calls)
                });
                reject(new Error("Active call not found"));
                return;
              }

              // Find the parent and child calls
              let parentCall: ContextCallInfo | null = null;
              let childCall: ContextCallInfo | null = null;

              if (currentCall.childSessionId) {
                parentCall = currentCall;
                childCall =
                  currentState.calls[currentCall.childSessionId] || null;
              } else if (currentCall.parentSessionId) {
                childCall = currentCall;
                parentCall =
                  currentState.calls[currentCall.parentSessionId] || null;
              } else {
                parentCall =
                  Object.values(currentState.calls).find(
                    (call) => call.childSessionId
                  ) || null;

                if (parentCall?.childSessionId) {
                  childCall =
                    currentState.calls[parentCall.childSessionId] || null;
                }
              }

              if (!parentCall || !childCall) {
                logger.error("Cannot merge: parent or child call not found", {
                  currentCallId: currentCall.sessionId,
                  hasChild: !!currentCall.childSessionId,
                  hasParent: !!currentCall.parentSessionId,
                  allCallIds: Object.keys(currentState.calls),
                  callsCount: Object.keys(currentState.calls).length,
                  foundParent: !!parentCall,
                  foundChild: !!childCall
                });
                reject(new Error("Parent or child call not found"));
                return;
              }

              const sippyCup = await ensureInitialized();

              logger.debug("Merging attended transfer", {
                mode,
                parentCallId: parentCall.callId,
                parentSessionId: parentCall.sessionId,
                childCallId: childCall.callId,
                childSessionId: childCall.sessionId,
                activeCallId: currentState.activeCallId,
                currentCallId: currentCall.callId,
                parentConferenceId: parentCall.conferenceId,
                totalCallsInState: Object.keys(currentState.calls).length
              });

              const voipBridge = VoipBridge.getInstance();
              const parentSipSession = getSipSession(parentCall.sessionId);
              const childSipSession = getSipSession(childCall.sessionId);

              let parentResolvedCallId = resolveBackendCallId(
                parentCall,
                parentSipSession,
                sippyCup.getServerCallIdForApi(parentCall.sessionId)
              );
              let childResolvedCallId = resolveBackendCallId(
                childCall,
                childSipSession,
                sippyCup.getServerCallIdForApi(childCall.sessionId)
              );

              const isVoipRelationship =
                voipBridge.isVoipCall(parentCall.sessionId) ||
                voipBridge.isVoipCall(childCall.sessionId) ||
                !!parentSipSession ||
                !!childSipSession;

              const needsHydration =
                isVoipRelationship ||
                !parentResolvedCallId ||
                parentResolvedCallId === parentCall.sessionId ||
                !childResolvedCallId ||
                childResolvedCallId === childCall.sessionId;

              if (needsHydration) {
                const hydratedParentCallId = await hydrateCallBackendId(
                  parentCall.sessionId,
                  1500
                );
                const hydratedChildCallId = await hydrateCallBackendId(
                  childCall.sessionId,
                  1500
                );
                parentResolvedCallId =
                  hydratedParentCallId || parentResolvedCallId;
                childResolvedCallId =
                  hydratedChildCallId || childResolvedCallId;
              }

              const resolvedParentCall: ContextCallInfo = {
                ...parentCall,
                callId: parentResolvedCallId || parentCall.callId
              };
              const resolvedChildCall: ContextCallInfo = {
                ...childCall,
                callId: childResolvedCallId || childCall.callId
              };

              if (
                parentResolvedCallId &&
                parentResolvedCallId !== parentCall.callId
              ) {
                updateCall(parentCall.sessionId, {
                  callId: parentResolvedCallId
                });
              }
              if (
                childResolvedCallId &&
                childResolvedCallId !== childCall.callId
              ) {
                updateCall(childCall.sessionId, {
                  callId: childResolvedCallId
                });
              }

              if (mode === "attendedTransfer") {
                if (parentSipSession && childSipSession) {
                  logger.debug("mergeAttendedTransfer: REFER request started", {
                    parentSessionId: parentCall.sessionId,
                    childSessionId: childCall.sessionId
                  });
                  await parentSipSession.attendedTransferTo(childSipSession);
                  logger.debug("mergeAttendedTransfer: REFER accepted");
                  parentSipSession.sipTerminate();
                } else {
                  await sippyCup.completeAttendedTransfer(
                    parentCall.sessionId,
                    childCall.sessionId,
                    { terminateLocalLegs: true }
                  );
                }
              } else {
                if (!resolvedParentCall.callId || !resolvedChildCall.callId) {
                  reject(new Error("Cannot merge call: missing call identifiers"));
                  return;
                }
                if (resolvedParentCall.callId === resolvedChildCall.callId) {
                  reject(
                    new Error("Cannot merge call: duplicate merge identifiers")
                  );
                  return;
                }
                if (
                  resolvedParentCall.callId ===
                    resolvedParentCall.sessionId ||
                  resolvedChildCall.callId === resolvedChildCall.sessionId
                ) {
                  reject(
                    new Error(
                      "Cannot merge call: backend call id not ready (still using SIP session id)"
                    )
                  );
                  return;
                }

                console.warn(
                  "[MERGE-DIAG] mergeAttendedTransfer (Android) → conference API",
                  JSON.stringify({
                    parentBackendCallId: resolvedParentCall.callId,
                    childBackendCallId: resolvedChildCall.callId,
                    parentSessionId: parentCall.sessionId,
                    childSessionId: childCall.sessionId,
                    path: resolvedParentCall.conferenceId
                      ? "addParticipantToConferenceCall"
                      : "startConference"
                  })
                );

                const rebind = (
                  sippyCup as unknown as {
                    rebindNativeCallUUID?: (
                      a: string,
                      b: string
                    ) => string | undefined;
                  }
                ).rebindNativeCallUUID;
                if (isVoipRelationship && typeof rebind === "function") {
                  const reboundUUID = rebind.call(
                    sippyCup,
                    parentCall.sessionId,
                    childCall.sessionId
                  );
                  if (reboundUUID) {
                    sippyCup.emit(
                      "callStateChanged",
                      childCall.sessionId,
                      CallState.CONNECTED
                    );
                  }
                }

                if (resolvedParentCall.conferenceId) {
                  await addParticipantToConferenceCall(
                    resolvedChildCall,
                    resolvedParentCall
                  );
                } else {
                  await startConference(resolvedChildCall, resolvedParentCall);
                }
              }

              updateCall(parentCall.sessionId, {
                childSessionId: undefined
              });
              updateCall(childCall.sessionId, {
                parentSessionId: undefined,
                attendedTransfer: false
              });

              logger.debug("Merge completed successfully");
              resolve();
            } catch (error) {
              logger.error("Failed to merge attended transfer:", error);
              reject(error);
            }
          })();

          return currentState;
        });
      });
    },
    [
      addParticipantToConferenceCall,
      ensureInitialized,
      hydrateCallBackendId,
      startConference,
      updateCall
    ]
  );

  // const completeAttendedTransferNew = useCallback(async () => {
  //   // Find parent and child calls using session ID pointers
  //   const parentCall = Object.values(state.calls).find(
  //     (call) => call.childSessionId
  //   );
  //   if (parentCall?.childSessionId) {
  //     const childCall = state.calls[parentCall.childSessionId];
  //     if (childCall) {
  //       const sippyCup = await ensureInitialized();
  //       setState((prev) => ({
  //         ...prev,
  //         activeCallId: undefined
  //       }));
  //
  //       await sippyCup.completeAttendedTransfer(
  //         parentCall.sessionId,
  //         childCall.sessionId
  //       );
  //       await completeAttendedTransfer(
  //         parentCall.sessionId,
  //         childCall.sessionId
  //       );
  //     }
  //   }
  // }, [state.calls, completeAttendedTransfer]);
  //
  /**
   * Cancel an attended transfer
   * @param sessionId - Either the parent (original) call ID or child (transfer) call ID
   */
  const cancelAttendedTransfer = useCallback(
    async (sessionId: string) => {
      logger.debug("cancelAttendedTransfer: Starting cancel process", {
        sessionId,
        timestamp: new Date().toISOString()
      });

      return new Promise<void>((resolve, reject) => {
        setState((currentState) => {
          (async () => {
            try {
              // Determine if we were given a parent or child session ID
              let parentSessionId: string;
              let childSessionId: string;
              let parentCall;

              const providedCall = currentState.calls[sessionId];
              if (!providedCall) {
                logger.error("cancelAttendedTransfer: Call not found", {
                  sessionId,
                  availableCallIds: Object.keys(currentState.calls),
                  totalCalls: Object.keys(currentState.calls).length
                });
                reject(new Error("Cannot cancel transfer - call not found"));
                return;
              }

              // Check if this is a parent call (has childSessionId)
              if (providedCall.childSessionId) {
                logger.debug(
                  "cancelAttendedTransfer: Provided ID is parent call",
                  {
                    parentSessionId: sessionId,
                    childSessionId: providedCall.childSessionId
                  }
                );
                parentSessionId = sessionId;
                childSessionId = providedCall.childSessionId;
                parentCall = providedCall;
              }
              // Check if this is a child call (has parentSessionId)
              else if (providedCall.parentSessionId) {
                logger.debug(
                  "cancelAttendedTransfer: Provided ID is child call, finding parent",
                  {
                    childSessionId: sessionId,
                    parentSessionId: providedCall.parentSessionId
                  }
                );
                parentSessionId = providedCall.parentSessionId;
                childSessionId = sessionId;
                parentCall = currentState.calls[parentSessionId];
              }
              // Neither parent nor child - not in a transfer
              else {
                logger.warn(
                  "cancelAttendedTransfer: Call is not part of a transfer",
                  {
                    sessionId
                  }
                );
                resolve();
                return;
              }

              if (!parentCall || !childSessionId) {
                logger.error("cancelAttendedTransfer: Invalid transfer state", {
                  parentFound: !!parentCall,
                  childSessionId
                });
                reject(new Error("Cannot cancel transfer - invalid state"));
                return;
              }

              const childCall = currentState.calls[childSessionId];
              logger.debug("cancelAttendedTransfer: Found calls", {
                parentCall: {
                  sessionId: parentCall.sessionId,
                  isOnHold: parentCall.isOnHold,
                  childSessionId: parentCall.childSessionId
                },
                childCall: {
                  exists: !!childCall,
                  sessionId: childCall?.sessionId,
                  parentSessionId: childCall?.parentSessionId
                }
              });

              // Clean up state relationships
              setState((prev) => {
                const updatedCalls = { ...prev.calls };

                // Clear childSessionId from parent call
                if (updatedCalls[parentSessionId]) {
                  updatedCalls[parentSessionId] = {
                    ...updatedCalls[parentSessionId],
                    childSessionId: undefined
                  };
                  logger.debug(
                    "cancelAttendedTransfer: Cleared childSessionId from parent"
                  );
                }

                // Clear parentSessionId from child call if it still exists
                if (updatedCalls[childSessionId]) {
                  updatedCalls[childSessionId] = {
                    ...updatedCalls[childSessionId],
                    parentSessionId: undefined
                  };
                  logger.debug(
                    "cancelAttendedTransfer: Cleared parentSessionId from child"
                  );
                }

                // Set parent call as active
                logger.debug(
                  "cancelAttendedTransfer: Setting parent as active call",
                  {
                    parentSessionId
                  }
                );

                return {
                  ...prev,
                  calls: updatedCalls,
                  activeCallId: parentSessionId
                };
              });

              // VoIP path: use SipSession directly (SippyCup routes to SessionManager which has no VoIP sessions)
              const childSipSession = getSipSession(childSessionId);
              const parentSipSession = getSipSession(parentSessionId);
              if (childSipSession || parentSipSession) {
                if (childSipSession) {
                  childSipSession.sipTerminate();
                  removeSipSession(childSessionId);
                }
                if (parentSipSession) {
                  parentSipSession.sipUnhold();
                  updateCall(parentSessionId, { isOnHold: false });
                }
                sippyCupRef.current?.emit(
                  "callStateChanged",
                  parentSessionId,
                  CallState.CONNECTED
                );
              } else {
                const sippyCup = await ensureInitialized();
                await sippyCup.cancelAttendedTransfer(
                  parentSessionId,
                  childSessionId
                );
              }

              logger.debug(
                "cancelAttendedTransfer: Transfer cancelled successfully",
                {
                  parentSessionId,
                  childSessionId,
                  timestamp: new Date().toISOString()
                }
              );

              resolve();
            } catch (error) {
              logger.error(
                "cancelAttendedTransfer: Failed to cancel transfer",
                {
                  error: error instanceof Error ? error.message : String(error),
                  stack: error instanceof Error ? error.stack : undefined
                }
              );
              reject(error);
            }
          })();

          return currentState;
        });
      });
    },
    [ensureInitialized, updateCall]
  );

  const addParticipantToConference = useCallback(async () => {
    // TODO: Implement participant addition to conference
  }, []);

  const setMutedConferenceParticipant = useCallback(
    (sessionId: string, channel: string) => {
      setState((currentState) => {
        const call = currentState.calls[sessionId];
        if (call) {
          updateCall(sessionId, {
            mutedConferenceParticipants: [
              ...call.mutedConferenceParticipants,
              channel
            ]
          });
        }
        return currentState;
      });
    },
    [updateCall]
  );

  const removeMutedConferenceParticipant = useCallback(
    (sessionId: string, channel: string) => {
      setState((currentState) => {
        const call = currentState.calls[sessionId];
        if (call) {
          updateCall(sessionId, {
            mutedConferenceParticipants:
              call.mutedConferenceParticipants.filter((c) => c !== channel)
          });
        }
        return currentState;
      });
    },
    [updateCall]
  );

  const unMuteAllConferenceParticipants = useCallback(
    async (sessionId: string) => {
      updateCall(sessionId, { mutedConferenceParticipants: [] });
    },
    [updateCall]
  );

  const getAllCalls = useCallback(() => {
    let result: ContextCallInfo[] = [];
    setState((currentState) => {
      result = Object.values(currentState.calls);
      return currentState;
    });
    return result;
  }, []);

  const getShowActiveCallBar = useCallback(() => {
    return !!currentCall || callsOnHold.length > 0;
  }, [currentCall, callsOnHold]);

  const getConferenceCall = useCallback(() => {
    let result: ContextCallInfo | null = null;
    setState((currentState) => {
      result =
        Object.values(currentState.calls).find((call) => call.conferencing) ||
        null;
      return currentState;
    });
    return result;
  }, []);

  const getOriginalCallOnHold = useCallback(() => {
    // Simplified implementation
    return false;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const cup = sippyCupRef.current;
      sippyCupRef.current = null;
      if (cup) {
        cup.dispose().catch(() => {});
      }
    };
  }, []);

  /**
   * Handle VoIP call display in native UI - needs to be separate to avoid circular dependency
   */
  useEffect(() => {
    const voipBridge = VoipBridge.getInstance();
    const isUnknownIdentity = (
      displayName?: string | null,
      uri?: string | null
    ) => {
      const name = (displayName || "").trim().toLowerCase();
      const remote = (uri || "").trim().toLowerCase();
      return (
        name === "" ||
        name === "unknown caller" ||
        (name === "unknown" && remote === "")
      );
    };

    const handleVoipCallDisplay = async (
      callId: string,
      callInfo: CallInfo
    ) => {
      console.log(
        "🟪 [SoftphoneProvider] 📞 handleVoipCallDisplay called - DISPLAYING NEW CALL:",
        {
          callId,
          callInfoState: callInfo.state,
          remoteDisplayName: callInfo.remoteDisplayName,
          remoteUri: callInfo.remoteUri,
          platform: Platform.OS,
          timestamp: new Date().toISOString()
        }
      );
      try {
        // DEDUPLICATION: When app is in foreground, SIP INVITE often arrives before FCM push.
        // If we already have an incoming/connecting/connected call for the same caller, skip
        // displaying the VoIP call - otherwise we get duplicate CallKeep UIs and "ringing again"
        // when user ends the SIP call (the duplicate VoIP CallKeep stays active).
        const callerNumber =
          callInfo.remoteUri?.match(/sip:(\d+)@/)?.[1] ||
          callInfo.remoteDisplayName?.replace(/\D/g, "") ||
          "";
        const hasMatchingSipCall = Object.values(stateRef.current.calls).some(
          (call) => {
            if (voipBridge.isVoipCall(call.sessionId)) return false;
            const callNumber =
              call.remoteUri?.match(/sip:(\d+)@/)?.[1] ||
              call.remoteDisplayName?.replace(/\D/g, "") ||
              "";
            const sameCaller =
              callerNumber && callNumber && callNumber === callerNumber;
            const activeState = [
              CallState.INCOMING,
              CallState.CONNECTING,
              CallState.CONNECTED
            ].includes(call.state);
            return sameCaller && activeState;
          }
        );
        if (hasMatchingSipCall) {
          console.log(
            "🟪 [SoftphoneProvider] 📞 Skipping VoIP display - already have matching SIP call for same caller:",
            { callerNumber }
          );
          logger.debug(
            "Skipping VoIP display - duplicate of existing SIP call",
            { callerNumber }
          );
          return;
        }

        // DON'T add VoIP call to UI state - it's just a placeholder waiting for SIP INVITE
        // The VoIP bridge tracks it internally via voipCalls Set

        // IMPORTANT: On iOS, skip displayIncomingCall because AppDelegate.mm already
        // reported the call to CallKit natively via RNCallKeep.reportNewIncomingCall.
        // Calling displayIncomingCall again would launch the app unnecessarily.
        // The call will stay in native CallKit UI until user answers/declines.
        if (Platform.OS === "ios") {
          console.log(
            "🟪 [SoftphoneProvider] 📞 iOS: Skipping displayIncomingCall (already handled by AppDelegate)"
          );
          console.log(
            "🟪 [SoftphoneProvider] 📞 VoIP call registered, waiting for SIP INVITE:",
            {
              callId
            }
          );
          logger.debug("iOS VoIP call registered, waiting for SIP INVITE", {
            callId
          });
          return;
        }

        // Android: displayIncomingCall is called by setupVoipBridge's incomingVoipCall
        // listener only AFTER establishInboundSession succeeds (INVITE received).
        // Do not show CallKeep here - it would show before SIP/INVITE.
        console.log(
          "🟪 [SoftphoneProvider] 📞 Android: displayIncomingCall will be shown after INVITE (in setupVoipBridge)"
        );
      } catch (error) {
        console.error(
          "🟪 [SoftphoneProvider] 📞 ❌ Error handling VoIP call:",
          error
        );
        logger.error("Error handling VoIP call:", error);
      }
    };

    // Kill-state / launch-from-answer: process launch intent and any pending call
    const pending = voipBridge.getAndClearPendingIncomingCall();
    const launchIntent = getAndClearLaunchIntent();
    if (pending) {
      const pendingPayload = (pending.callData?.payload ??
        pending.callInfo?.voipPayload ??
        {}) as Record<string, unknown>;
      if (
        Platform.OS === "android" &&
        shouldSkipStaleVoipPush(
          pendingPayload,
          pending.callUuid,
          "SoftphoneProvider.pending"
        )
      ) {
        dismissStaleAndroidVoipCall(pending.callUuid, pending.callData);
      } else {
      // Pending exists when handleVoipCall ran before listener was ready (kill state) or
      // when this effect re-runs after a call arrived (e.g. ensureInitialized changed).
      // Only mark CONNECTED if user actually launched from Answer; otherwise INCOMING.
      const isLaunchFromAnswer =
        launchIntent?.launchFromAnswer && launchIntent?.callUuid === pending.callUuid;
      const callState = isLaunchFromAnswer ? CallState.CONNECTED : (pending.callInfo.state ?? CallState.INCOMING);
      const callAlreadyInState =
        resolveCallsRecordKey(stateRef.current.calls, pending.callUuid) !==
        undefined;

      if (callAlreadyInState && !isLaunchFromAnswer) {
        // Foreground: normal flow already added the call with INCOMING. Skip to avoid overwriting.
        console.log(
          "🟪 [SoftphoneProvider] 📞 Skipping pending — call already in state (foreground flow)",
          { callUuid: pending.callUuid }
        );
      } else {
        const isGhostConnectedPending =
          Platform.OS === "android" &&
          !isLaunchFromAnswer &&
          callState === CallState.CONNECTED &&
          !getSipSession(pending.callUuid) &&
          isUnknownIdentity(
            pending.callInfo.remoteDisplayName,
            pending.callInfo.remoteUri
          );
        if (isGhostConnectedPending) {
          logger.warn("Skipping ghost pending connected call on startup", {
            callUuid: pending.callUuid,
            state: callState,
            remoteDisplayName: pending.callInfo.remoteDisplayName,
            remoteUri: pending.callInfo.remoteUri
          });
          setState((prev) => {
            const key = resolveCallsRecordKey(prev.calls, pending.callUuid);
            if (!key || !prev.calls[key]) return prev;
            const { [key]: _removed, ...rest } = prev.calls;
            return {
              ...prev,
              calls: rest,
              activeCallId:
                prev.activeCallId === key ||
                prev.activeCallId === pending.callUuid
                  ? undefined
                  : prev.activeCallId
            };
          });
          return;
        }

        // Android cold start / kill state: do NOT show InCall until SIP INVITE exists.
        // Pending was stored when FCM ran before listeners; replay must use establishInboundSession.
        if (Platform.OS === "android" && !isLaunchFromAnswer) {
          const callUuid = pending.callUuid;
          const payload =
            pending.callData?.payload ?? pending.callInfo?.voipPayload;
          const callerIp =
            payload?.payload_ip ||
            payload?.callerIp ||
            payload?.ip ||
            payload?.data?.callerIp ||
            payload?.dictionaryPayload?.callerIp;

          void (async () => {
            const vb = VoipBridge.getInstance();
            const cleanupVoipPlaceholder = () => {
              try {
                vb.handleCallEnd(callUuid);
              } catch (_e) {
                /* ignore */
              }
            };

            if (!callerIp || String(callerIp).trim() === "") {
              logger.warn(
                "🟪 [SoftphoneProvider] Pending Android inbound: no payload_ip — cannot wait for INVITE, discarding stale VoIP UI",
                { callUuid }
              );
              cleanupVoipPlaceholder();
              return;
            }

            const reduxState = store.getState() as any;
            const { authReducer, userReducer } = reduxState;
            if (!authReducer.isLoggedIn || !userReducer.user) {
              logger.warn(
                "🟪 [SoftphoneProvider] Pending Android inbound: user not logged in"
              );
              cleanupVoipPlaceholder();
              return;
            }

            const configOverrideAndroid: SipConfig = {
              displayName: userReducer.user.extName || "User",
              user: userReducer.user.peerName,
              password: userReducer.user.peerSecret,
              domain: "dev-sip.voxo.co",
              uri: "wss://api.voxo.co/webrtc",
              iceServers: [
                {
                  urls: [
                    "stun:stun.l.google.com:19302",
                    "stun:stun1.l.google.com:19302"
                  ]
                }
              ],
              useAudio: true,
              useVideo: false,
              useRinging: true,
              autoAnswer: false,
              autoReject: false
            };

            try {
              const sippyCupInbound = await ensureInitialized(
                false,
                configOverrideAndroid
              );
              await sippyCupInbound.ensureNativeReady();
              if (stateRef.current.isRegistered) {
                console.warn(
                  "[SP] Pending Android: unregistering primary SIP before wake-up inbound"
                );
                await sippyCupInbound.unregister();
              }
              console.warn(
                `[SP] Pending Android: establishInboundSession after REGISTER (wait for INVITE) callUuid=${callUuid}`
              );
              await sippyCupInbound.establishInboundSession(callUuid, callerIp);

              // incomingCall may update softphone state on the next tick — retry briefly.
              let sipRow = Object.values(stateRef.current.calls).find(
                (c) => c.callUuid === callUuid
              );
              if (!sipRow) {
                await new Promise((r) => setTimeout(r, 120));
                sipRow = Object.values(stateRef.current.calls).find(
                  (c) => c.callUuid === callUuid
                );
              }
              if (sipRow) {
                if (pending.callInfo.voipPayload != null) {
                  updateCall(sipRow.sessionId, {
                    voipPayload: pending.callInfo.voipPayload
                  });
                }
                setActiveCallId(sipRow.sessionId);
                navigation.navigate("InCallScreen", {
                  callId: sipRow.sessionId
                });
              } else {
                logger.error(
                  "🟪 [SoftphoneProvider] Pending Android: INVITE established but no calls[] row — do not show answer UI",
                  { callUuid }
                );
                cleanupVoipPlaceholder();
              }
            } catch (e: any) {
              logger.error(
                "🟪 [SoftphoneProvider] Pending Android inbound failed (no answerable INVITE)",
                e
              );
              if (e?.error === "RECEIVE_INVITE_TIMEOUT") {
                console.error(
                  "[SoftphoneProvider] Pending Android: INVITE timeout — discarding stale incoming UI"
                );
              } else if (e?.error === "INVITE_ANSWERED_ELSEWHERE") {
                console.error("[SoftphoneProvider] Pending Android: answered elsewhere");
              } else if (e?.error === "INVITE_CANCELLED_EARLY") {
                console.error("[SoftphoneProvider] Pending Android: call cancelled");
              } else if (e?.error === "REGISTRATION_FAILED") {
                console.error("[SoftphoneProvider] Pending Android: registration failed");
              }
              cleanupVoipPlaceholder();
              removeCall(callUuid);
              setState((prev) => ({
                ...prev,
                activeCallId:
                  prev.activeCallId === callUuid ? undefined : prev.activeCallId
              }));
            }
          })();
          return;
        }

        console.log(
          "🟪 [SoftphoneProvider] 📞 Processing pending incoming call:",
          { callUuid: pending.callUuid, isLaunchFromAnswer, callState }
        );
        handleVoipCallDisplay(pending.callUuid, pending.callInfo);
        const callInfoToAdd = {
          ...pending.callInfo,
          state: callState,
          ...(isLaunchFromAnswer && { answerTime: new Date() })
        };
        const call = callInfoToContextCall(callInfoToAdd, pending.callUuid);
        addCall(call);
        setActiveCallId(call.sessionId);
        navigateToInCallScreen(pending.callUuid);
      }
      }
    } else {
      // Android fallback: getLaunchOptions may not run when React context was reused from headless
      if (
        Platform.OS === "android" &&
        (!launchIntent?.launchFromAnswer || !launchIntent?.callUuid) &&
        !launchIntentCheckedRef.current
      ) {
        launchIntentCheckedRef.current = true;
        const Notifications = NativeModules.VoxoConnectAndroidNotifications;
        if (Notifications?.getLaunchFromAnswerIntent) {
          Notifications.getLaunchFromAnswerIntent()
            .then((nativeIntent: { launchFromAnswer?: boolean; callUuid?: string; callerName?: string; callerNumber?: string } | null) => {
              if (nativeIntent?.launchFromAnswer && nativeIntent?.callUuid) {
                processLaunchFromAnswer(
                  true,
                  nativeIntent.callUuid,
                  nativeIntent.callerName,
                  nativeIntent.callerNumber
                );
              }
            })
            .catch(() => {});
        }
      }
      if (launchIntent?.launchFromAnswer && launchIntent?.callUuid) {
        processLaunchFromAnswer(
          true,
          launchIntent.callUuid,
          launchIntent.callerName,
          launchIntent.callerNumber
        );
      }
    }

    return () => {
    };
  }, [
    ensureInitialized,
    addCall,
    setActiveCallId,
    updateCall,
    removeCall,
    processLaunchFromAnswer,
    navigateToInCallScreen
  ]);

  // Fallback: navigate to InCallScreen when we have active call but nav may have failed
  // (e.g. kill-state answer before auth/navigation ready)
  const activeCallId = state.activeCallId;
  const isLoggedIn = user !== null;
  useEffect(() => {
    const activeCall = activeCallId ? state.calls[activeCallId] : undefined;
    if (
      Platform.OS === "android" &&
      activeCallId &&
      activeCallId !== "dialing" &&
      activeCall &&
      activeCall.state !== CallState.ENDED &&
      activeCall.state !== CallState.FAILED &&
      isLoggedIn &&
      getCurrentRoute()?.name !== Routes.InCallScreen
    ) {
      InteractionManager.runAfterInteractions(() => {
        setTimeout(() => {
          if (getCurrentRoute()?.name !== Routes.InCallScreen) {
            try {
              navigation.navigate("InCallScreen", { callId: activeCallId });
            } catch (_e) {}
          }
        }, 300);
      });
    }
  }, [activeCallId, isLoggedIn]);

  /**
   * Handle VoIP call answering - needs to be separate to avoid circular dependency
   */
  useEffect(() => {
    const voipBridge = VoipBridge.getInstance();

    const handleVoipAnswer = async (callId: string) => {
      console.log(
        "� [SoftphoneProvider] 📞 handleVoipAnswer called (SlimSipClient):",
        {
          callId,
          platform: Platform.OS,
          timestamp: new Date().toISOString()
        }
      );
      try {
        const voipBridge = VoipBridge.getInstance();

        // CRITICAL: Get the stored SipSession from SlimSipClient
        // Do NOT gate on voipBridge.isVoipCall - voipCalls can be cleared if VoipBridge
        // was disposed/recreated (e.g. setupVoipBridge effect re-run). If we have a
        // sip session in pendingSipSessions, we can answer it.
        const sipSession = getSipSession(callId);

        if (!sipSession && Platform.OS === "android") {
          // Android FCM inbound: SessionManager leg (no SlimSip SipSession)
          try {
            const voipCallData = voipBridge.getVoipCallData(callId);
            const existingCall = getCallById(callId);
            const sipSessionId = existingCall?.sessionId ?? callId;
            const callerName =
              voipCallData?.callerName ||
              existingCall?.remoteDisplayName ||
              "Unknown";

            if (existingCall) {
              updateCall(callId, {
                state: CallState.CONNECTING,
                connected: false,
                answerTime: new Date().toISOString()
              });
            } else {
              const voipCallEntry: ContextCallInfo = {
                callId: callId,
                sessionId: sipSessionId,
                callUuid: callId,
                state: CallState.CONNECTING,
                direction: CallDirection.INCOMING,
                remoteDisplayName: callerName,
                remoteUri: voipCallData
                  ? `sip:${voipCallData.callerNumber}@dev-sip.voxo.co`
                  : "",
                remoteParty: undefined,
                startTime: new Date().toISOString(),
                answerTime: new Date().toISOString(),
                endTime: undefined,
                isMuted: false,
                isOnHold: false,
                isSpeakerOn: false,
                isEmergency: false,
                connected: false,
                recording: false,
                conferencing: false,
                conferenceId: undefined,
                attendedTransfer: false,
                parentSessionId: undefined,
                childSessionId: undefined,
                totalCallDuration: 0,
                currentHoldDuration: 0,
                totalHoldDuration: 0,
                mutedConferenceParticipants: []
              };
              addCall(voipCallEntry);
            }
            setActiveCallId(sipSessionId);
            navigation.navigate("InCallScreen", { callId: sipSessionId });
            const cup = await ensureInitialized(false);
            // Cancel native auto-decline immediately; CONNECTED comes from SessionManager Established.
            await cup.answerCall(sipSessionId, callerName);
          } catch (error) {
            console.error(
              "[SoftphoneProvider] Android answerCall (SessionManager) failed:",
              error
            );
            updateCall(callId, { state: CallState.FAILED, connected: false });
            const cupErr = await ensureInitialized(false);
            cupErr.emit("callStateChanged", callId, CallState.FAILED);
          }
          return;
        }

        if (!sipSession) {
          console.error(
            "� [SoftphoneProvider] 📞 ❌ No SipSession found for callId:",
            callId
          );
          logger.error("No SipSession found to answer", { callId });

          // Update state to show error
          updateCall(callId, {
            state: CallState.FAILED,
            connected: false
          });
          return;
        }

        console.log(
          "� [SoftphoneProvider] 📞 ✅ Found SipSession, calling sipSession.answer()..."
        );

        // CRITICAL: Add the VoIP call to the provider's calls state.
        // Without this, updateCall silently no-ops (call doesn't exist in state),
        // and when the server CANCELs the SessionManager INVITE, allCalls becomes
        // empty → InCallScreen shows "call ended" and navigates away.
        const voipCallData = voipBridge.getVoipCallData(callId);
        const existingCall = getCallById(callId);

        const voipCallEntry: ContextCallInfo = {
          callId: callId,
          sessionId: callId,
          state: CallState.CONNECTING,
          direction: CallDirection.INCOMING,
          remoteDisplayName:
            voipCallData?.callerName ||
            existingCall?.remoteDisplayName ||
            "Unknown",
          remoteUri: voipCallData
            ? `sip:${voipCallData.callerNumber}@dev-sip.voxo.co`
            : existingCall?.remoteUri || "",
          remoteParty: undefined,
          startTime: new Date().toISOString(),
          answerTime: new Date().toISOString(),
          endTime: undefined,
          isMuted: false,
          isOnHold: false,
          isSpeakerOn: false,
          isEmergency: false,
          connected: false,
          recording: false,
          conferencing: false,
          conferenceId: undefined,
          attendedTransfer: false,
          parentSessionId: undefined,
          childSessionId: undefined,
          totalCallDuration: 0,
          currentHoldDuration: 0,
          totalHoldDuration: 0,
          mutedConferenceParticipants: []
        };

        if (existingCall) {
          updateCall(callId, {
            state: CallState.CONNECTING,
            connected: false,
            answerTime: new Date().toISOString(),
            remoteDisplayName: existingCall.remoteDisplayName || voipCallEntry.remoteDisplayName,
            remoteUri: existingCall.remoteUri || voipCallEntry.remoteUri
          });
          console.warn(
            `📞 [SP] ${new Date().toISOString()} handleVoipAnswer: updated existing call ${callId} in provider state`
          );
        } else {
          addCall(voipCallEntry);
          console.warn(
            `📞 [SP] ${new Date().toISOString()} handleVoipAnswer: added VoIP call ${callId} to provider state`
          );
        }

        // Set as active call and navigate to InCallScreen
        setActiveCallId(callId);
        navigation.navigate("InCallScreen", { callId });

        // CRITICAL: Attach established() listeners BEFORE answer(). If answer() runs first,
        // rtcSession may fire "accepted" synchronously and we'd miss it (promise never resolves).
        const establishedPromise = sipSession.established();

        sipSession.answer();

        console.log(
          "� [SoftphoneProvider] 📞 ✅ sipSession.answer() called, waiting for call to establish..."
        );

        await establishedPromise;

        console.log(
          "� [SoftphoneProvider] 📞 ✅ Call established successfully!"
        );

        // Update call state to CONNECTED
        updateCall(callId, {
          state: CallState.CONNECTED,
          connected: true
        });

        // CRITICAL: Emit callStateChanged so NativeIntegration stops ringtone,
        // calls CallKeep.setCurrentCallActive, and starts InCallManager.
        const sippyCup = await ensureInitialized(false);
        sippyCup.emit("callStateChanged", callId, CallState.CONNECTED);
        
      } catch (error) {
        console.error(
          "� [SoftphoneProvider] 📞 ❌ Error answering VoIP call:",
          error
        );
        logger.error("Error answering VoIP call:", error);

        // Update state to show error
        updateCall(callId, {
          state: CallState.FAILED,
          connected: false
        });

        // CRITICAL: Emit callStateChanged so NativeIntegration clears activeCalls
        const sippyCupErr = await ensureInitialized(false);
        sippyCupErr.emit("callStateChanged", callId, CallState.FAILED);

        // Cleanup
        removeSipSession(callId);
        VoipBridge.getInstance().handleCallEnd(callId);
      }
    };

    voipBridge.on("answerVoipCall", handleVoipAnswer);

    return () => {
      voipBridge.off("answerVoipCall", handleVoipAnswer);
    };
  }, [ensureInitialized, addCall, updateCall, setActiveCallId, getCallById]);

  const hasOngoingCall =
    state.activeCallId === "dialing" ||
    (state.activeCallId !== "testing" &&
      Object.values(state.calls).some(
        (c) => c.state !== CallState.ENDED && c.state !== CallState.FAILED
      ));

  // Context value
  const contextValue = {
    // State
    ...state,
    hasOngoingCall,

    // Computed properties
    currentCall,
    incomingCalls,
    callsOnHold,

    // Core actions
    setConfig,
    makeCall,
    answerCall,
    answerCallViaCallKeep,
    answerVoipCallFromInApp,
    declineCall: hangupCall,
    hangupCall,
    holdCall,
    unholdCall,
    muteCall,
    unmuteCall,
    setSpeaker,
    sendDTMF,
    transferCall,
    startAttendedTransfer,
    completeAttendedTransfer,
    cancelAttendedTransfer,
    swapAttendedTransferCalls,
    clearError,
    cleanup,

    // Compatibility methods (should be refactored out)
    setCurrentCall,
    setCurrentCallConnected,
    updateCurrentCallData,
    clearCurrentCall,
    addIncomingCall,
    removeIncomingCall,
    addCallOnHold,
    removeCallOnHold,
    holdCurrentCall,
    getCallById,
    getChildCallBySessionId,
    getParentCallBySessionId,
    updateCallDurations,
    setConferencing,
    startConference,
    addParticipantToConferenceCall,
    mergeAttendedTransfer,
    addParticipantToConference,
    setMutedConferenceParticipant,
    removeMutedConferenceParticipant,
    unMuteAllConferenceParticipants,
    getAllCalls,
    getShowActiveCallBar,
    getConferenceCall,
    getOriginalCallOnHold
  };

  return (
    <SoftphoneContext.Provider value={contextValue}>
      {children}
    </SoftphoneContext.Provider>
  );
};
