/**
 * In-memory + MMKV dedupe for Sendbird local notifications (SDK websocket vs FCM).
 * MMKV lets the FCM headless JS context see posts from the main app websocket path.
 */
import { Platform } from "react-native";
import { createMMKV } from "react-native-mmkv";

const displayedMessageIds = new Set<number>();
const inFlightMessageIds = new Set<number>();
const inFlightClaimedAt = new Map<number, number>();
const inFlightSourceById = new Map<number, "sdk" | "fcm">();
const CACHE_SIZE = 200;
const EXPIRY_MS = 120_000;
const DISPLAYED_PERSIST_MS = 120_000;
const DISPLAYED_KEY_PREFIX = "displayed_";

/** Release stale claims so the other path is not blocked for minutes. */
export const IN_FLIGHT_CLAIM_TIMEOUT_MS = 5000;

let persistStorage: ReturnType<typeof createMMKV> | null = null;

function getPersistStorage() {
  if (Platform.OS !== "android") {
    return null;
  }
  if (!persistStorage) {
    persistStorage = createMMKV({ id: "sendbird-notif-dedupe" });
  }
  return persistStorage;
}

function normalizeId(messageId: number | string): number | null {
  const id = Number(messageId);
  return Number.isFinite(id) ? id : null;
}

function isStaleInFlight(id: number): boolean {
  const claimedAt = inFlightClaimedAt.get(id) ?? 0;
  return Date.now() - claimedAt > IN_FLIGHT_CLAIM_TIMEOUT_MS;
}

function scheduleInFlightTimeout(id: number): void {
  setTimeout(() => {
    if (inFlightMessageIds.has(id) && isStaleInFlight(id)) {
      inFlightMessageIds.delete(id);
      inFlightClaimedAt.delete(id);
      inFlightSourceById.delete(id);
    }
  }, IN_FLIGHT_CLAIM_TIMEOUT_MS);
}

function wasDisplayedPersisted(id: number): boolean {
  const storage = getPersistStorage();
  if (!storage) {
    return false;
  }
  const raw = storage.getString(`${DISPLAYED_KEY_PREFIX}${id}`);
  if (!raw) {
    return false;
  }
  const ts = Number(raw);
  if (!Number.isFinite(ts) || Date.now() - ts > DISPLAYED_PERSIST_MS) {
    storage.remove(`${DISPLAYED_KEY_PREFIX}${id}`);
    return false;
  }
  return true;
}

function markDisplayedPersisted(id: number): void {
  const storage = getPersistStorage();
  if (storage) {
    storage.set(`${DISPLAYED_KEY_PREFIX}${id}`, String(Date.now()));
  }
}

export function wasSendbirdNotificationDisplayed(
  messageId: number | string
): boolean {
  const id = normalizeId(messageId);
  if (id == null) {
    return false;
  }
  return displayedMessageIds.has(id) || wasDisplayedPersisted(id);
}

export function isSendbirdNotificationDisplayInFlight(
  messageId: number | string
): boolean {
  const id = normalizeId(messageId);
  if (id == null) return false;
  if (!inFlightMessageIds.has(id)) return false;
  if (isStaleInFlight(id)) {
    inFlightMessageIds.delete(id);
    inFlightClaimedAt.delete(id);
    inFlightSourceById.delete(id);
    return false;
  }
  return true;
}

export function getSendbirdNotificationInFlightSource(
  messageId: number | string
): "sdk" | "fcm" | null {
  const id = normalizeId(messageId);
  if (id == null || !isSendbirdNotificationDisplayInFlight(messageId)) {
    return null;
  }
  return inFlightSourceById.get(id) ?? null;
}

/** Skip posting when already shown or another path is actively posting. */
export function shouldSkipSendbirdNotificationDisplay(
  messageId: number | string,
  _source?: "sdk" | "fcm"
): boolean {
  if (wasSendbirdNotificationDisplayed(messageId)) {
    return true;
  }
  if (isSendbirdNotificationDisplayInFlight(messageId)) {
    return true;
  }
  return false;
}

/** Returns false if already displayed or another path is posting Notifee. */
export function tryClaimSendbirdNotificationDisplay(
  messageId: number | string,
  source: "sdk" | "fcm" = "sdk"
): boolean {
  const id = normalizeId(messageId);
  if (id == null) return true;
  if (displayedMessageIds.has(id) || wasDisplayedPersisted(id)) {
    return false;
  }
  if (inFlightMessageIds.has(id) && !isStaleInFlight(id)) {
    return false;
  }
  inFlightMessageIds.add(id);
  inFlightClaimedAt.set(id, Date.now());
  inFlightSourceById.set(id, source);
  scheduleInFlightTimeout(id);
  return true;
}

export function releaseSendbirdNotificationDisplayClaim(
  messageId: number | string
): void {
  const id = normalizeId(messageId);
  if (id != null) {
    inFlightMessageIds.delete(id);
    inFlightClaimedAt.delete(id);
    inFlightSourceById.delete(id);
  }
}

export function markSendbirdNotificationDisplayed(
  messageId: number | string
): void {
  const id = normalizeId(messageId);
  if (id == null) return;
  displayedMessageIds.add(id);
  markDisplayedPersisted(id);
  inFlightMessageIds.delete(id);
  inFlightClaimedAt.delete(id);
  inFlightSourceById.delete(id);
  if (displayedMessageIds.size > CACHE_SIZE) {
    const toRemove = Array.from(displayedMessageIds).slice(0, 40);
    toRemove.forEach((x) => displayedMessageIds.delete(x));
  }
  setTimeout(() => {
    displayedMessageIds.delete(id);
    const storage = getPersistStorage();
    storage?.remove(`${DISPLAYED_KEY_PREFIX}${id}`);
  }, EXPIRY_MS);
}

/** @deprecated Use shouldSkipSendbirdNotificationDisplay */
export function shouldSkipFcmSendbirdDisplay(
  messageId: number | string
): boolean {
  return shouldSkipSendbirdNotificationDisplay(messageId, "fcm");
}
