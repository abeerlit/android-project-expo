import { NativeModules, Platform } from "react-native";
import CallKeep from "react-native-callkeep";
import InCallManager from "react-native-incall-manager";

type VoxoCallAudioNative = {
  setSpeakerphoneEnabled: (enabled: boolean) => void;
};

type WebRTCModuleNative = {
  setAudioDevice?: (deviceId: string) => void;
  startMediaDevicesEventMonitor?: () => void;
};

let desiredSpeakerOn = false;

type CallKeepUuidResolver = (callId: string) => string | undefined;
let resolveCallKeepUuid: CallKeepUuidResolver | null = null;

type CustomNotificationCallChecker = (
  callKeepUuid?: string,
  callId?: string
) => boolean;
let isCustomNotificationCall: CustomNotificationCallChecker | null = null;

/** Register mapping from SIP session id → CallKeep UUID (set from NativeIntegration). */
export function registerCallKeepUuidResolver(
  resolver: CallKeepUuidResolver | null
): void {
  resolveCallKeepUuid = resolver;
}

/** Foreground/kill custom-notification inbound (no Telecom Connection). */
export function registerCustomNotificationCallChecker(
  checker: CustomNotificationCallChecker | null
): void {
  isCustomNotificationCall = checker;
}

/** Last user-selected speaker state (Android reconnect / CONNECTED re-apply). */
export function getDesiredCallSpeaker(): boolean {
  return desiredSpeakerOn;
}

type HeadlessCallEntry = { sessionId?: string };

function isHeadlessKillStateCall(
  callId?: string,
  callKeepUuid?: string
): boolean {
  const map = (
    global as { __headlessCallSessions?: Map<string, HeadlessCallEntry> }
  ).__headlessCallSessions;
  if (!map?.size) return false;
  if (callKeepUuid && map.has(callKeepUuid)) return true;
  if (callId && map.has(callId)) return true;
  for (const entry of map.values()) {
    if (entry?.sessionId && entry.sessionId === callId) return true;
  }
  return false;
}

function usesInCallManagerOnlyRoute(
  callId?: string,
  callKeepUuid?: string
): boolean {
  if (isHeadlessKillStateCall(callId, callKeepUuid)) {
    return true;
  }
  return isCustomNotificationCall?.(callKeepUuid, callId) === true;
}

function resolveCallKeepUuidForRoute(
  callId?: string,
  callKeepUuid?: string
): string | undefined {
  if (callKeepUuid) return callKeepUuid;
  if (!callId) return undefined;
  return resolveCallKeepUuid?.(callId);
}

function applyInCallManagerSpeaker(enabled: boolean, force: boolean): void {
  try {
    InCallManager.setSpeakerphoneOn(enabled);
    if (force) {
      InCallManager.setForceSpeakerphoneOn(enabled);
    }
  } catch {
    /* best-effort */
  }
}

function applyCallSpeakerAndroidOnce(
  enabled: boolean,
  logTag: string,
  callId?: string,
  callKeepUuid?: string
): void {
  const uuid = resolveCallKeepUuidForRoute(callId, callKeepUuid);
  const inCallManagerOnly = usesInCallManagerOnlyRoute(callId, uuid ?? callKeepUuid);

  // Custom notification + kill-state: no Telecom Connection. WebRTC setAudioDevice and
  // VoxoCallAudio.setCommunicationDevice break remote AudioTrack playout on Android 12+.
  if (inCallManagerOnly) {
    console.warn(
      `${logTag} InCallManager-only route callId=${callId ?? "?"} uuid=${uuid ?? callKeepUuid ?? "?"} enabled=${enabled}`
    );
    applyInCallManagerSpeaker(enabled, false);
    return;
  }

  if (uuid) {
    try {
      CallKeep.toggleAudioRouteSpeaker(uuid, enabled);
      console.warn(
        `${logTag} CallKeep.toggleAudioRouteSpeaker uuid=${uuid} enabled=${enabled}`
      );
    } catch (e) {
      console.warn(`${logTag} CallKeep.toggleAudioRouteSpeaker failed`, e);
    }
  } else if (callId) {
    console.warn(
      `${logTag} no CallKeep UUID for callId=${callId} (Telecom route skipped)`
    );
  }

  try {
    const webRtc = NativeModules.WebRTCModule as WebRTCModuleNative | undefined;
    webRtc?.startMediaDevicesEventMonitor?.();
    webRtc?.setAudioDevice?.(
      enabled ? "SPEAKERPHONE" : "WIRED_OR_EARPIECE"
    );
    console.warn(
      `${logTag} WebRTCModule.setAudioDevice(${enabled ? "SPEAKERPHONE" : "WIRED_OR_EARPIECE"})`
    );
  } catch (e) {
    console.warn(`${logTag} WebRTCModule.setAudioDevice failed`, e);
  }

  try {
    const mod = NativeModules.VoxoCallAudio as VoxoCallAudioNative | undefined;
    mod?.setSpeakerphoneEnabled?.(enabled);
  } catch (e) {
    console.warn(`${logTag} VoxoCallAudio.setSpeakerphoneEnabled failed`, e);
  }

  applyInCallManagerSpeaker(enabled, true);
}

/**
 * Route in-app VoIP call audio to speaker or earpiece on Android.
 * Uses CallKeep Telecom route + Daily WebRTC device selection + InCallManager.
 */
export function applyCallSpeakerAndroid(
  enabled: boolean,
  logTag = "[VOXO-CALL-AUDIO]",
  callId?: string,
  callKeepUuid?: string
): void {
  if (Platform.OS !== "android") return;

  desiredSpeakerOn = enabled;
  applyCallSpeakerAndroidOnce(enabled, logTag, callId, callKeepUuid);

  if (enabled && !usesInCallManagerOnlyRoute(callId, callKeepUuid)) {
    setTimeout(
      () =>
        applyCallSpeakerAndroidOnce(
          true,
          `${logTag} delayed-80ms`,
          callId,
          callKeepUuid
        ),
      80
    );
    setTimeout(
      () =>
        applyCallSpeakerAndroidOnce(
          true,
          `${logTag} delayed-350ms`,
          callId,
          callKeepUuid
        ),
      350
    );
  }
}

/** Re-apply speaker after InCallManager.start / Telecom may reset the route. */
export function reapplyDesiredCallSpeakerAndroid(
  logTag = "[VOXO-CALL-AUDIO]",
  callId?: string,
  callKeepUuid?: string
): void {
  if (Platform.OS !== "android" || !desiredSpeakerOn) return;
  applyCallSpeakerAndroidOnce(true, `${logTag} reapply`, callId, callKeepUuid);
}

/**
 * After long STREAM_RING + WebRtcAudioTrack startPlayout, re-bind earpiece/speaker
 * without touching WebRTC setAudioDevice (custom-notification path).
 */
export function recoverCustomNotificationPlayout(
  logTag = "[VOXO-CALL-AUDIO]",
  callId?: string,
  callKeepUuid?: string,
  speakerOn = false
): void {
  if (Platform.OS !== "android") return;
  if (!usesInCallManagerOnlyRoute(callId, callKeepUuid)) {
    applyCallSpeakerAndroidOnce(speakerOn, logTag, callId, callKeepUuid);
    return;
  }

  console.warn(
    `${logTag} recoverRemotePlayout speakerOn=${speakerOn} callId=${callId ?? "?"} uuid=${callKeepUuid ?? "?"}`
  );
  applyInCallManagerSpeaker(speakerOn, false);

  const retry = (delayMs: number) => {
    setTimeout(() => {
      applyInCallManagerSpeaker(speakerOn, false);
      console.warn(`${logTag} recoverRemotePlayout retry ${delayMs}ms`);
    }, delayMs);
  };
  retry(80);
  retry(200);
  retry(500);
}
