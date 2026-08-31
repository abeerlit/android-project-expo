import type { SharedMediaItem } from "core/navigation/types/types.ts";

/**
 * Stashes inbound share media while auth rehydrates or the user logs in
 * (same pattern as LaunchIntent for CallKeep answer-from-kill).
 */
let pendingMedia: SharedMediaItem[] | null = null;

export function setPendingShareMedia(media: SharedMediaItem[]): void {
  pendingMedia = media.length > 0 ? media : null;
}

export function peekPendingShareMedia(): SharedMediaItem[] | null {
  return pendingMedia;
}

export function getAndClearPendingShareMedia(): SharedMediaItem[] | null {
  const result = pendingMedia;
  pendingMedia = null;
  return result;
}

export function clearPendingShareMedia(): void {
  pendingMedia = null;
}
