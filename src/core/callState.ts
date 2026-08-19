/**
 * Tracks whether we're in an active or connecting call flow.
 * Used to skip/defer heavy fetches (directory, conversations, channels)
 * when app returns from background during a call — e.g. user accepted from
 * notification and app briefly went to background.
 */
let hasActiveOrConnectingCall = false;

export function setCallActive(active: boolean): void {
  hasActiveOrConnectingCall = active;
}

export function hasActiveCall(): boolean {
  return hasActiveOrConnectingCall;
}
