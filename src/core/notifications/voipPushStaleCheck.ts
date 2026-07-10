import { AppState, NativeModules, Platform } from "react-native";
import { VoipBridge } from "../softphone/VoipBridge.ts";
import type { VoipCallData } from "./NotificationManager.ts";
import { scheduleStaleVoipMissedCallFallback } from "./staleVoipMissedCallFallback.ts";

export const VOIP_PUSH_MAX_AGE_MS = 15_000;

function coerceSentAt(value: unknown): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

export function parseVoipSentAt(
  payload: Record<string, unknown>
): number | null {
  return (
    coerceSentAt(payload.sentAt) ??
    coerceSentAt(payload.payload_sentAt) ??
    coerceSentAt(payload.payloadSentAt)
  );
}

export function isVoipPushStaleDeclined(
  payload: Record<string, unknown>
): boolean {
  const flag = payload.staleDeclined;
  return flag === true || flag === 1 || flag === "1" || flag === "YES";
}

export function getVoipPushAge(payload: Record<string, unknown>): {
  stale: boolean;
  ageMs: number;
  sentAt: number | null;
} {
  if (isVoipPushStaleDeclined(payload)) {
    const sentAt = parseVoipSentAt(payload);
    const ageMs =
      sentAt != null ? Math.max(0, Date.now() - sentAt) : VOIP_PUSH_MAX_AGE_MS;
    return { stale: true, ageMs, sentAt };
  }

  const sentAt = parseVoipSentAt(payload);
  if (sentAt == null) {
    return { stale: false, ageMs: 0, sentAt: null };
  }

  const ageMs = Math.max(0, Date.now() - sentAt);
  return {
    stale: ageMs > VOIP_PUSH_MAX_AGE_MS,
    ageMs,
    sentAt
  };
}

export function logStaleVoipPushSkip(
  source: string,
  callUuid: string,
  ageMs: number,
  sentAt: number | null
): void {
  console.warn(
    `📞 [STALE-VOIP] ${source} skip callUuid=${callUuid} ageMs=${ageMs} sentAt=${sentAt ?? "null"}`
  );
}

/** Idempotent cleanup when a delayed FCM push is too old to ring. */
export function dismissStaleAndroidVoipCall(
  callUuid: string,
  callData?: VoipCallData
): void {
  if (!callUuid) {
    return;
  }

  try {
    VoipBridge.getInstance().handleCallEnd(callUuid);
  } catch {
    /* ignore */
  }

  if (Platform.OS === "android") {
    const Notifications = NativeModules.VoxoConnectAndroidNotifications;
    try {
      const appInForeground = AppState.currentState === "active";
      Notifications?.reportIncomingCallCancelled?.(callUuid, appInForeground);
      Notifications?.stopIncomingCallRingtone?.(callUuid);
    } catch {
      /* ignore */
    }
  }

  if (callData) {
    scheduleStaleVoipMissedCallFallback(callData);
  }
}

export function shouldSkipStaleVoipPush(
  payload: Record<string, unknown>,
  callUuid: string,
  source: string
): boolean {
  const { stale, ageMs, sentAt } = getVoipPushAge(payload);
  if (!stale) {
    return false;
  }
  logStaleVoipPushSkip(source, callUuid, ageMs, sentAt);
  return true;
}
