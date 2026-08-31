import * as Sentry from "@sentry/react-native";
import { Platform, AppState } from "react-native";

export const SAMSUNG_ISSUES_EVENT = "samsung issues";

export const ANDROID_CALLFLOW_SUBSYSTEM = "VOXO_ANDROID_CALLFLOW";

function safePayload(data?: Record<string, unknown>): string {
  if (!data) return "";
  try {
    return ` | ${JSON.stringify(data)}`;
  } catch {
    return " | [payload stringify failed]";
  }
}

function toSerializable(
  data?: Record<string, unknown>
): Record<string, string | number | boolean | null> {
  if (!data) return {};
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(data)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value == null
    ) {
      out[key] = value as string | number | boolean | null;
    } else {
      try {
        out[key] = JSON.stringify(value);
      } catch {
        out[key] = "[unserializable]";
      }
    }
  }
  return out;
}

export function androidCallFlowLog(
  area: string,
  message: string,
  data?: Record<string, unknown>
): void {
  if (Platform.OS !== "android") {
    return;
  }

  const ts = new Date().toISOString();
  const serialized = toSerializable(data);
  console.warn(
    `${ANDROID_CALLFLOW_SUBSYSTEM} ${ts} [${area}] ${message}${safePayload(data)}`
  );

  Sentry.addBreadcrumb({
    category: "voxo.callflow.android",
    level: "info",
    message: `[${area}] ${message}`,
    data: serialized
  });

  Sentry.captureMessage(`VOXO_ANDROID_CALLFLOW [${area}] ${message}`, "info");
}

export function androidCallFlowError(
  area: string,
  message: string,
  error: unknown,
  data?: Record<string, unknown>
): void {
  if (Platform.OS !== "android") {
    return;
  }

  const err = error instanceof Error ? error : new Error(String(error));
  const merged = {
    ...(data || {}),
    errorMessage: err.message,
    errorName: err.name
  };

  androidCallFlowLog(area, `${message} (error)`, merged);
  Sentry.withScope((scope) => {
    scope.setTag("callflow", "android");
    scope.setTag("callflow_area", area);
    scope.setContext("callflow", toSerializable(merged));
    Sentry.captureException(err);
  });
}

const outboundConnectedAtMs = new Map<string, number>();
const recentOutboundByDest = new Map<
  string,
  { atMs: number; callUuid?: string; origin?: string }
>();

const OUTBOUND_SAME_DEST_WINDOW_MS = 8_000;

type AndroidOutboundAudioPhase =
  | "duplicate_outbound_while_live"
  | "duplicate_same_destination"
  | "ringback_after_connected"
  | "hold_music_over_live_call_suspect"
  | "outbound_local_audio_overlap_suspect"
  | "incallmanager_restart_while_connected";

function normalizeOutboundDestKey(destination: string): string {
  const trimmed = String(destination || "").trim();
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 3 ? digits : trimmed.toLowerCase();
}

function emitOutboundAudioAnomaly(
  phase: AndroidOutboundAudioPhase,
  data: Record<string, unknown>
): void {
  if (Platform.OS !== "android") {
    return;
  }

  const payload = toSerializable({
    phase,
    appState: AppState.currentState,
    ...data
  });

  console.warn(
    `${ANDROID_CALLFLOW_SUBSYSTEM} ${new Date().toISOString()} [outboundAudioAnomaly] ${phase}${safePayload(
      payload
    )}`
  );

  Sentry.withScope((scope) => {
    scope.setLevel("error");
    scope.setTag("feature", "android_outbound_audio_overlap");
    scope.setTag("outbound_audio_phase", phase);
    scope.setTag("platform", "android");
    scope.setContext("android_outbound_audio_overlap", payload);
    Sentry.captureMessage(`Android outbound audio overlap: ${phase}`, "error");
  });
}

export function noteOutboundConnected(callId: string): void {
  if (Platform.OS !== "android" || !callId) return;
  outboundConnectedAtMs.set(callId, Date.now());
}

export function hasActiveOutboundConnected(): boolean {
  return outboundConnectedAtMs.size > 0;
}

export function hasOtherOutboundConnected(exceptCallId?: string): boolean {
  for (const id of outboundConnectedAtMs.keys()) {
    if (!exceptCallId || id !== exceptCallId) {
      return true;
    }
  }
  return false;
}

export function noteOutboundHangup(callId: string): void {
  if (Platform.OS !== "android" || !callId) return;
  outboundConnectedAtMs.delete(callId);
}

export function noteOutboundTerminal(
  callId: string,
  terminalState: string,
  data: Record<string, unknown> = {}
): void {
  if (Platform.OS !== "android" || !callId) return;
  const connectedAt = outboundConnectedAtMs.get(callId);
  outboundConnectedAtMs.delete(callId);
  if (connectedAt == null) return;
  androidCallFlowLog("outboundAudio", "outbound terminal after connected", {
    callId,
    terminalState,
    connectedMs: Date.now() - connectedAt,
    ...data
  });
}

export function noteRingbackAfterConnected(
  data: Record<string, unknown> = {}
): void {
  const payload = {
    signal: "ringback_or_progress_after_connected",
    ...data
  };
  emitOutboundAudioAnomaly("ringback_after_connected", payload);
  emitOutboundAudioAnomaly("hold_music_over_live_call_suspect", payload);
  emitOutboundAudioAnomaly("outbound_local_audio_overlap_suspect", payload);
}

export function noteRingbackStartWhileConnected(
  data: Record<string, unknown> = {}
): void {
  if (!hasActiveOutboundConnected()) return;
  const payload = {
    signal: "ringback_start_while_connected",
    liveConnectedCount: outboundConnectedAtMs.size,
    ...data
  };
  emitOutboundAudioAnomaly("outbound_local_audio_overlap_suspect", payload);
  emitOutboundAudioAnomaly("hold_music_over_live_call_suspect", payload);
}

export function noteInCallManagerRestartWhileConnected(
  data: Record<string, unknown> = {}
): void {
  if (!hasActiveOutboundConnected()) return;
  emitOutboundAudioAnomaly("incallmanager_restart_while_connected", {
    signal: "incallmanager_start_while_connected",
    liveConnectedCount: outboundConnectedAtMs.size,
    ...data
  });
  emitOutboundAudioAnomaly("outbound_local_audio_overlap_suspect", {
    signal: "incallmanager_start_while_connected",
    liveConnectedCount: outboundConnectedAtMs.size,
    ...data
  });
}

export function noteOutboundPlaceAttempt(data: {
  destination: string;
  origin?: string;
  liveCallCount?: number;
  liveSessionIds?: string[];
  callUuid?: string;
}): void {
  if (Platform.OS !== "android") return;

  const liveCallCount = data.liveCallCount ?? 0;
  const alreadyConnected = hasActiveOutboundConnected();

  if (liveCallCount > 0) {
    emitOutboundAudioAnomaly("duplicate_outbound_while_live", {
      ...data,
      liveCallCount
    });
    if (alreadyConnected) {
      emitOutboundAudioAnomaly("outbound_local_audio_overlap_suspect", {
        signal: "second_outbound_while_connected",
        ...data,
        liveCallCount
      });
    }
  }

  const destKey = normalizeOutboundDestKey(data.destination);
  const now = Date.now();
  if (destKey) {
    const prev = recentOutboundByDest.get(destKey);
    if (
      prev &&
      now - prev.atMs <= OUTBOUND_SAME_DEST_WINDOW_MS &&
      (!data.callUuid ||
        !prev.callUuid ||
        data.callUuid.toLowerCase() !== prev.callUuid.toLowerCase())
    ) {
      emitOutboundAudioAnomaly("duplicate_same_destination", {
        ...data,
        destKey,
        msSincePriorDial: now - prev.atMs,
        priorCallUuid: prev.callUuid,
        priorOrigin: prev.origin
      });
      emitOutboundAudioAnomaly("outbound_local_audio_overlap_suspect", {
        signal: "duplicate_same_destination_dial",
        ...data,
        destKey,
        msSincePriorDial: now - prev.atMs,
        priorCallUuid: prev.callUuid,
        alreadyConnected
      });
    }
    recentOutboundByDest.set(destKey, {
      atMs: now,
      callUuid: data.callUuid,
      origin: data.origin
    });
  }
}

type AndroidIncomingRingPhase =
  | "notification_answer_tap"
  | "lock_screen_answer_no_pickup"
  | "app_opens_no_pickup"
  | "voip_answer_failed"
  | "voip_answer_no_session"
  | "answer_never_connected"
  | "answered_elsewhere_ring_should_stop"
  | "remote_ended_ring_should_stop"
  | "invite_timeout_ring_should_stop"
  | "ringing_never_stops_suspect"
  | "ring_teardown_requested";

/** Phases that match the Mobility ticket: Accept opens the app but SIP never answers. */
const SAMSUNG_ISSUE_ERROR_PHASES = new Set<AndroidIncomingRingPhase>([
  "lock_screen_answer_no_pickup",
  "app_opens_no_pickup",
  "voip_answer_failed",
  "voip_answer_no_session",
  "answer_never_connected"
]);

const SAMSUNG_ISSUE_INFO_PHASES = new Set<AndroidIncomingRingPhase>([
  "notification_answer_tap"
]);

const samsungAppOpensNoPickupSent = new Set<string>();

type AndroidDeviceConstants = {
  Brand?: string;
  Manufacturer?: string;
  Model?: string;
  Release?: string;
  Version?: number;
};

function androidDeviceContext(): Record<string, string | number | boolean | null> {
  if (Platform.OS !== "android") {
    return {};
  }
  const c = (Platform.constants ?? {}) as AndroidDeviceConstants;
  const manufacturer = String(c.Manufacturer ?? "").toLowerCase();
  const brand = String(c.Brand ?? "").toLowerCase();
  const isSamsung =
    manufacturer.includes("samsung") || brand.includes("samsung");
  return {
    manufacturer: c.Manufacturer ?? null,
    brand: c.Brand ?? null,
    model: c.Model ?? null,
    androidRelease: c.Release ?? null,
    androidSdk: typeof c.Version === "number" ? c.Version : null,
    isSamsung
  };
}

function captureSamsungIssue(
  phase: AndroidIncomingRingPhase,
  payload: Record<string, string | number | boolean | null>,
  level: "error" | "info"
): void {
  const device = androidDeviceContext();
  const merged = { ...device, ...payload, phase };
  const isSamsung = device.isSamsung === true;

  Sentry.withScope((scope) => {
    scope.setLevel(level);
    scope.setTag("feature", "android_incoming_answer_ring");
    scope.setTag("incoming_ring_phase", phase);
    scope.setTag("platform", "android");
    scope.setTag("samsung_issues", "true");
    scope.setTag("issue_family", "samsung_issues");
    scope.setTag("is_samsung", isSamsung ? "true" : "false");
    if (typeof device.manufacturer === "string") {
      scope.setTag("device_manufacturer", device.manufacturer);
    }
    if (typeof device.brand === "string") {
      scope.setTag("device_brand", device.brand);
    }
    if (typeof device.model === "string") {
      scope.setTag("device_model", device.model);
    }
    if (typeof device.androidRelease === "string") {
      scope.setTag("android_release", device.androidRelease);
    }
    scope.setFingerprint(["samsung-issues", phase]);
    scope.setContext("samsung_issues", merged);
    scope.setContext("android_incoming_answer_ring", merged);
    Sentry.captureMessage(`${SAMSUNG_ISSUES_EVENT}: ${phase}`, level);
  });
}

const incomingRingStartedAtMs = new Map<string, number>();
const incomingAnswerAttemptAtMs = new Map<string, number>();
const incomingRingWatchdogs = new Map<string, ReturnType<typeof setTimeout>>();
const incomingAnswerWatchdogs = new Map<string, ReturnType<typeof setTimeout>>();

const RING_NEVER_STOPS_MS = 90_000;
const ANSWER_NO_PICKUP_MS = 25_000;

function normalizeIncomingUuid(callUuid: string): string {
  return String(callUuid || "").trim().toLowerCase();
}

function clearIncomingRingWatchdog(callUuid: string): void {
  const key = normalizeIncomingUuid(callUuid);
  const t = incomingRingWatchdogs.get(key);
  if (t) {
    clearTimeout(t);
    incomingRingWatchdogs.delete(key);
  }
}

function clearIncomingAnswerWatchdog(callUuid: string): void {
  const key = normalizeIncomingUuid(callUuid);
  const t = incomingAnswerWatchdogs.get(key);
  if (t) {
    clearTimeout(t);
    incomingAnswerWatchdogs.delete(key);
  }
}

function emitIncomingRingAnomaly(
  phase: AndroidIncomingRingPhase,
  data: Record<string, unknown>
): void {
  if (Platform.OS !== "android") {
    return;
  }

  const payload = toSerializable({
    phase,
    appState: AppState.currentState,
    ticket:
      "Inbound Accept from lock screen / notification banner opens app but does not pick up",
    ...data
  });

  console.warn(
    `${ANDROID_CALLFLOW_SUBSYSTEM} ${new Date().toISOString()} [incomingRingAnomaly] ${phase}${safePayload(
      payload
    )}`
  );

  if (SAMSUNG_ISSUE_ERROR_PHASES.has(phase)) {
    captureSamsungIssue(phase, payload, "error");
    const uuid = String(data.callUuid ?? payload.callUuid ?? "").trim().toLowerCase();
    if (
      uuid &&
      (phase === "lock_screen_answer_no_pickup" ||
        phase === "answer_never_connected") &&
      !samsungAppOpensNoPickupSent.has(uuid)
    ) {
      samsungAppOpensNoPickupSent.add(uuid);
      captureSamsungIssue("app_opens_no_pickup", payload, "error");
    }
    return;
  }

  if (SAMSUNG_ISSUE_INFO_PHASES.has(phase)) {
    captureSamsungIssue(phase, payload, "info");
    return;
  }

  Sentry.withScope((scope) => {
    scope.setLevel("error");
    scope.setTag("feature", "android_incoming_answer_ring");
    scope.setTag("incoming_ring_phase", phase);
    scope.setTag("platform", "android");
    scope.setContext("android_incoming_answer_ring", payload);
    Sentry.captureMessage(`Android incoming answer/ring: ${phase}`, "error");
  });
}

export function noteIncomingRingStarted(
  callUuid: string,
  data: Record<string, unknown> = {}
): void {
  if (Platform.OS !== "android" || !callUuid) return;
  const key = normalizeIncomingUuid(callUuid);
  const now = Date.now();
  incomingRingStartedAtMs.set(key, now);
  clearIncomingRingWatchdog(key);

  androidCallFlowLog("incomingRing", "ring/notification started", {
    callUuid,
    ...data
  });

  const watchdog = setTimeout(() => {
    incomingRingWatchdogs.delete(key);
    if (!incomingRingStartedAtMs.has(key)) return;
    const startedAt = incomingRingStartedAtMs.get(key) ?? now;
    emitIncomingRingAnomaly("ringing_never_stops_suspect", {
      callUuid,
      ringMs: Date.now() - startedAt,
      signal: "no_teardown_within_watch_window",
      ...data
    });
  }, RING_NEVER_STOPS_MS);
  incomingRingWatchdogs.set(key, watchdog);
}

export function noteIncomingRingTeardown(
  callUuid: string,
  reason: string,
  data: Record<string, unknown> = {}
): void {
  if (Platform.OS !== "android" || !callUuid) return;
  const key = normalizeIncomingUuid(callUuid);
  const startedAt = incomingRingStartedAtMs.get(key);
  clearIncomingRingWatchdog(key);
  incomingRingStartedAtMs.delete(key);

  const payload = {
    callUuid,
    reason,
    ringMs: startedAt != null ? Date.now() - startedAt : undefined,
    ...data
  };

  if (
    reason === "answered_elsewhere" ||
    reason === "remote_ended" ||
    reason === "invite_timeout" ||
    reason === "establish_timeout"
  ) {
    const phase: AndroidIncomingRingPhase =
      reason === "answered_elsewhere"
        ? "answered_elsewhere_ring_should_stop"
        : reason === "remote_ended"
          ? "remote_ended_ring_should_stop"
          : "invite_timeout_ring_should_stop";
    emitIncomingRingAnomaly(phase, payload);
  } else {
    androidCallFlowLog("incomingRing", "ring/notification teardown", payload);
  }
}

export function noteIncomingAnswerAttempt(
  callUuid: string,
  origin: string,
  data: Record<string, unknown> = {}
): void {
  if (Platform.OS !== "android" || !callUuid) return;
  const key = normalizeIncomingUuid(callUuid);
  const now = Date.now();
  incomingAnswerAttemptAtMs.set(key, now);
  clearIncomingAnswerWatchdog(key);

  emitIncomingRingAnomaly("notification_answer_tap", {
    callUuid,
    origin,
    ...data
  });

  const watchdog = setTimeout(() => {
    incomingAnswerWatchdogs.delete(key);
    if (!incomingAnswerAttemptAtMs.has(key)) return;
    const attemptedAt = incomingAnswerAttemptAtMs.get(key) ?? now;
    emitIncomingRingAnomaly("answer_never_connected", {
      callUuid,
      origin,
      answerWaitMs: Date.now() - attemptedAt,
      signal: "accept_launched_but_no_connected",
      ...data
    });
    emitIncomingRingAnomaly("lock_screen_answer_no_pickup", {
      callUuid,
      origin,
      answerWaitMs: Date.now() - attemptedAt,
      ...data
    });
  }, ANSWER_NO_PICKUP_MS);
  incomingAnswerWatchdogs.set(key, watchdog);
}

export function noteIncomingAnswerConnected(
  callUuid: string,
  data: Record<string, unknown> = {}
): void {
  if (Platform.OS !== "android" || !callUuid) return;
  const key = normalizeIncomingUuid(callUuid);
  clearIncomingAnswerWatchdog(key);
  incomingAnswerAttemptAtMs.delete(key);
  samsungAppOpensNoPickupSent.delete(key);
  noteIncomingRingTeardown(callUuid, "connected", data);
  androidCallFlowLog("incomingRing", "answer reached CONNECTED", {
    callUuid,
    ...data
  });
}

export function noteIncomingAnswerFailed(
  callUuid: string,
  error: unknown,
  data: Record<string, unknown> = {}
): void {
  if (Platform.OS !== "android" || !callUuid) return;
  const key = normalizeIncomingUuid(callUuid);
  clearIncomingAnswerWatchdog(key);
  incomingAnswerAttemptAtMs.delete(key);

  const err = error instanceof Error ? error : new Error(String(error));
  const noSession =
    /no sipsession|no session|not found/i.test(err.message) ||
    data.signal === "no_session";

  emitIncomingRingAnomaly(
    noSession ? "voip_answer_no_session" : "voip_answer_failed",
    {
      callUuid,
      errorMessage: err.message,
      ...data
    }
  );
  emitIncomingRingAnomaly("lock_screen_answer_no_pickup", {
    callUuid,
    errorMessage: err.message,
    ...data
  });
}

export function noteLaunchFromAnswerNoLiveSession(
  callUuid: string,
  data: Record<string, unknown> = {}
): void {
  if (Platform.OS !== "android" || !callUuid) return;
  const key = normalizeIncomingUuid(callUuid);
  clearIncomingAnswerWatchdog(key);
  incomingAnswerAttemptAtMs.delete(key);
  emitIncomingRingAnomaly("lock_screen_answer_no_pickup", {
    callUuid,
    signal: "launch_from_answer_no_live_session",
    ...data
  });
  emitIncomingRingAnomaly("voip_answer_no_session", {
    callUuid,
    signal: "launch_from_answer_no_live_session",
    ...data
  });
}

type AndroidOutboundUplinkPhase =
  | "getusermedia_failed"
  | "getusermedia_no_audio_tracks"
  | "no_audio_sender_at_connected"
  | "sender_disabled_at_connected"
  | "sender_ended_at_connected"
  | "no_uplink_downlink_ok"
  | "muted_at_outbound_connected";

export type PeerMediaSnapshot = {
  audioSenderCount: number;
  audioReceiverCount: number;
  sendersEnabled: number;
  sendersLive: number;
  receiversLive: number;
  receiversEnabled: number;
  iceConnectionState?: string;
  connectionState?: string;
};

export function snapshotPeerConnectionMedia(
  pc: {
    getSenders?: () => Array<{ track?: { kind?: string; enabled?: boolean; readyState?: string } | null }>;
    getReceivers?: () => Array<{ track?: { kind?: string; enabled?: boolean; readyState?: string } | null }>;
    iceConnectionState?: string;
    connectionState?: string;
  } | null | undefined
): PeerMediaSnapshot {
  const empty: PeerMediaSnapshot = {
    audioSenderCount: 0,
    audioReceiverCount: 0,
    sendersEnabled: 0,
    sendersLive: 0,
    receiversLive: 0,
    receiversEnabled: 0
  };
  if (!pc) return empty;

  const senders = pc.getSenders?.() ?? [];
  const receivers = pc.getReceivers?.() ?? [];
  let audioSenderCount = 0;
  let sendersEnabled = 0;
  let sendersLive = 0;
  let audioReceiverCount = 0;
  let receiversLive = 0;
  let receiversEnabled = 0;

  for (const sender of senders) {
    const track = sender.track;
    if (!track || track.kind !== "audio") continue;
    audioSenderCount += 1;
    if (track.enabled) sendersEnabled += 1;
    if (track.readyState === "live") sendersLive += 1;
  }
  for (const receiver of receivers) {
    const track = receiver.track;
    if (!track || track.kind !== "audio") continue;
    audioReceiverCount += 1;
    if (track.enabled) receiversEnabled += 1;
    if (track.readyState === "live") receiversLive += 1;
  }

  return {
    audioSenderCount,
    audioReceiverCount,
    sendersEnabled,
    sendersLive,
    receiversLive,
    receiversEnabled,
    iceConnectionState: pc.iceConnectionState,
    connectionState: pc.connectionState
  };
}

function emitOutboundUplinkAnomaly(
  phase: AndroidOutboundUplinkPhase,
  data: Record<string, unknown>
): void {
  if (Platform.OS !== "android") {
    return;
  }

  const payload = toSerializable({
    phase,
    appState: AppState.currentState,
    ...data
  });

  console.warn(
    `${ANDROID_CALLFLOW_SUBSYSTEM} ${new Date().toISOString()} [outboundUplinkAnomaly] ${phase}${safePayload(
      payload
    )}`
  );

  Sentry.withScope((scope) => {
    scope.setLevel("error");
    scope.setTag("feature", "android_outbound_uplink");
    scope.setTag("outbound_uplink_phase", phase);
    scope.setTag("platform", "android");
    scope.setContext("android_outbound_uplink", payload);
    Sentry.captureMessage(`Android outbound uplink: ${phase}`, "error");
  });
}

export function noteOutboundGetUserMediaFailed(
  error: unknown,
  data: Record<string, unknown> = {}
): void {
  if (Platform.OS !== "android") return;
  const err = error instanceof Error ? error : new Error(String(error));
  emitOutboundUplinkAnomaly("getusermedia_failed", {
    errorMessage: err.message,
    errorName: err.name,
    ...data
  });
}

export function noteOutboundGetUserMediaResult(
  stream: { getAudioTracks?: () => Array<{ enabled?: boolean; readyState?: string; muted?: boolean }> } | null,
  data: Record<string, unknown> = {}
): void {
  if (Platform.OS !== "android") return;
  const tracks = stream?.getAudioTracks?.() ?? [];
  if (tracks.length === 0) {
    emitOutboundUplinkAnomaly("getusermedia_no_audio_tracks", data);
    return;
  }
  androidCallFlowLog("outboundUplink", "getUserMedia ok", {
    audioTrackCount: tracks.length,
    enabledCount: tracks.filter((t) => t.enabled).length,
    liveCount: tracks.filter((t) => t.readyState === "live").length,
    mutedCount: tracks.filter((t) => t.muted).length,
    ...data
  });
}

export function noteOutboundUplinkHealth(
  callId: string,
  snapshot: PeerMediaSnapshot,
  data: Record<string, unknown> = {}
): void {
  if (Platform.OS !== "android" || !callId) return;

  const payload = {
    callId,
    ...snapshot,
    ...data
  };

  androidCallFlowLog("outboundUplink", "media health snapshot", payload);

  const downlinkOk =
    snapshot.audioReceiverCount > 0 && snapshot.receiversLive > 0;
  const noSender = snapshot.audioSenderCount === 0;
  const senderDisabled =
    snapshot.audioSenderCount > 0 && snapshot.sendersEnabled === 0;
  const senderEnded =
    snapshot.audioSenderCount > 0 && snapshot.sendersLive === 0;

  if (data.isMuted === true && data.direction === "outbound") {
    emitOutboundUplinkAnomaly("muted_at_outbound_connected", payload);
  }

  if (noSender) {
    emitOutboundUplinkAnomaly("no_audio_sender_at_connected", payload);
  } else if (senderDisabled) {
    emitOutboundUplinkAnomaly("sender_disabled_at_connected", payload);
  } else if (senderEnded) {
    emitOutboundUplinkAnomaly("sender_ended_at_connected", payload);
  }

  if (downlinkOk && (noSender || senderDisabled || senderEnded)) {
    emitOutboundUplinkAnomaly("no_uplink_downlink_ok", payload);
  }
}
