/**
 * Store for highlighting a specific list item when user opens Inbox from a missed call or voicemail notification.
 * We store the call/voicemail identifiers from the notification so the list can highlight the matching row.
 */

const HIGHLIGHT_TTL_MS = 30_000;

let missedCallHighlight: {
  callUUID?: string;
  callId?: string;
  uniqueId?: string;
  at: number;
} | null = null;

let voicemailHighlight: {
  voicemailId?: number;
  at: number;
} | null = null;

function isExpired(at: number): boolean {
  return Date.now() - at > HIGHLIGHT_TTL_MS;
}

/** Call when user taps a missed call notification. Pass identifiers from the payload so the list can match the row. */
export function setMissedCallHighlight(ids: {
  callUUID?: string;
  callId?: string;
  uniqueId?: string;
}): void {
  missedCallHighlight = { ...ids, at: Date.now() };
}

/** Returns stored missed-call highlight ids if still valid. List should match item.callId, item.uniqueId, or callUUID. */
export function getMissedCallHighlight(): {
  callUUID?: string;
  callId?: string;
  uniqueId?: string;
} | null {
  if (!missedCallHighlight || isExpired(missedCallHighlight.at)) return null;
  return {
    callUUID: missedCallHighlight.callUUID,
    callId: missedCallHighlight.callId,
    uniqueId: missedCallHighlight.uniqueId
  };
}

/** Call when user taps a voicemail notification. Pass voicemail/message id from payload if available. */
export function setVoicemailHighlight(voicemailId?: number): void {
  voicemailHighlight = { voicemailId, at: Date.now() };
}

/** Returns stored voicemail highlight id if still valid. List should match item.id. */
export function getVoicemailHighlight(): number | null {
  if (!voicemailHighlight || isExpired(voicemailHighlight.at)) return null;
  return voicemailHighlight.voicemailId ?? null;
}
