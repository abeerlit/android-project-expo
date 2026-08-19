import { Platform } from "react-native";
import notifee, { AndroidImportance } from "@notifee/react-native";
import type { VoipCallData } from "./NotificationManager.ts";

const NOTIFICATION_ID_PREFIX = "stale-voip-missed";
const ANDROID_CHANNEL_ID = "voxo-call-events";
const FALLBACK_DELAY_MS = 5_000;

const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const serverHandledUuids = new Set<string>();

let androidChannelReady: Promise<unknown> | null = null;

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") {
    return;
  }
  if (!androidChannelReady) {
    androidChannelReady = notifee.createChannel({
      id: ANDROID_CHANNEL_ID,
      name: "Call events",
      importance: AndroidImportance.HIGH,
      vibration: true,
      sound: "default"
    });
  }
  await androidChannelReady;
}

export function markMissedCallHandledByServer(callUuid: string): void {
  if (!callUuid) {
    return;
  }
  serverHandledUuids.add(callUuid);
  const timer = pendingTimers.get(callUuid);
  if (timer) {
    clearTimeout(timer);
    pendingTimers.delete(callUuid);
  }
}

function buildMissedCallTitle(callData: VoipCallData): string {
  const name = callData.callerName?.trim();
  const number = callData.callerNumber?.trim();
  if (name && name !== "Unknown" && name !== "Unknown Caller") {
    return `Missed call from ${name}`;
  }
  if (number && number !== "Unknown" && number !== "Unknown Number") {
    return `Missed call from ${number}`;
  }
  return "Missed call";
}

async function displayStaleMissedCallNotification(
  callData: VoipCallData
): Promise<void> {
  const callUuid = callData.callUuid;
  if (!callUuid || serverHandledUuids.has(callUuid)) {
    return;
  }

  try {
    await ensureAndroidChannel();
    await notifee.displayNotification({
      id: `${NOTIFICATION_ID_PREFIX}-${callUuid}`,
      title: buildMissedCallTitle(callData),
      body: "You have a missed call",
      data: {
        click_action: "CALL-EVENT-MISSED",
        callUUID: callUuid,
        callUuid,
        vm_payload_type: "missed_call"
      },
      android: {
        channelId: ANDROID_CHANNEL_ID,
        importance: AndroidImportance.HIGH,
        pressAction: { id: "default" },
        smallIcon: "ic_launcher",
        timestamp: Date.now()
      }
    });
  } catch (e) {
    console.warn(
      "[staleVoipMissedCallFallback] displayNotification failed:",
      e
    );
  }
}

export function scheduleStaleVoipMissedCallFallback(
  callData: VoipCallData
): void {
  const callUuid = callData.callUuid;
  if (!callUuid) {
    return;
  }

  if (serverHandledUuids.has(callUuid)) {
    return;
  }

  const existing = pendingTimers.get(callUuid);
  if (existing) {
    clearTimeout(existing);
  }

  const timer = setTimeout(() => {
    pendingTimers.delete(callUuid);
    if (serverHandledUuids.has(callUuid)) {
      return;
    }
    void displayStaleMissedCallNotification(callData);
  }, FALLBACK_DELAY_MS);

  pendingTimers.set(callUuid, timer);
}

export function extractCallUuidFromMissedCallPayload(
  payload: Record<string, unknown>
): string | null {
  const raw =
    payload.callUUID ??
    payload.callUuid ??
    payload.uuid ??
    payload.payload_callUUID ??
    payload.payload_callUuid;
  if (typeof raw === "string" && raw.length > 0) {
    return raw;
  }
  return null;
}
