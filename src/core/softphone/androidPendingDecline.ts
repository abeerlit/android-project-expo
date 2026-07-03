/**
 * Tracks FCM call UUIDs the user declined before a SIP INVITE/session existed,
 * and recent user-initiated declines (for suppressing spurious missed-call FCM).
 */
const pendingDeclines = new Set<string>();

const RECENT_DECLINE_TTL_MS = 45_000;

type RecentDecline = {
  at: number;
  callUuid?: string;
  sipCallId?: string;
  callerNumber?: string;
};

const recentUserDeclines: RecentDecline[] = [];

function pruneRecentDeclines(now = Date.now()): void {
  while (
    recentUserDeclines.length > 0 &&
    now - recentUserDeclines[0].at > RECENT_DECLINE_TTL_MS
  ) {
    recentUserDeclines.shift();
  }
}

function normalizeCallerNumber(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, "");
  return digits || value.trim();
}

export function markAndroidPendingDecline(callUuid: string): void {
  if (!callUuid) return;
  pendingDeclines.add(callUuid);
  console.warn(
    `📞 [androidPendingDecline] marked pending decline for ${callUuid}`
  );
}

export function isAndroidPendingDecline(callUuid: string): boolean {
  return pendingDeclines.has(callUuid);
}

export function consumeAndroidPendingDecline(callUuid: string): boolean {
  if (!pendingDeclines.has(callUuid)) return false;
  pendingDeclines.delete(callUuid);
  return true;
}

export function clearAndroidPendingDecline(callUuid: string): void {
  pendingDeclines.delete(callUuid);
}

/** Record that the user explicitly declined (603) — suppress missed-call FCM for same caller. */
export function markAndroidUserDeclinedCall(params: {
  callUuid?: string;
  sipCallId?: string;
  callerNumber?: string;
}): void {
  const now = Date.now();
  pruneRecentDeclines(now);
  recentUserDeclines.push({
    at: now,
    callUuid: params.callUuid,
    sipCallId: params.sipCallId,
    callerNumber: normalizeCallerNumber(params.callerNumber)
  });
  console.warn(`📞 [androidPendingDecline] recorded user decline`, params);
}

/** Server may send a different callUUID on missed-call push; match by caller number or SIP Call-ID. */
export function shouldSuppressMissedCallAfterUserDecline(params: {
  callUUID?: string;
  callerNumber?: string;
}): boolean {
  const now = Date.now();
  pruneRecentDeclines(now);
  const fcmUuid = params.callUUID;
  const caller = normalizeCallerNumber(params.callerNumber);
  return recentUserDeclines.some((entry) => {
    if (now - entry.at > RECENT_DECLINE_TTL_MS) return false;
    if (fcmUuid && (entry.callUuid === fcmUuid || entry.sipCallId === fcmUuid)) {
      return true;
    }
    if (caller && entry.callerNumber && entry.callerNumber === caller) {
      return true;
    }
    return false;
  });
}
