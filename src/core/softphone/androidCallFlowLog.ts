import * as Sentry from "@sentry/react-native";
import { Platform, AppState } from "react-native";

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
