/** meet.voxo.co universal link handling (parity with bare Entrypoint.tsx). */

export const MEET_HOST = "meet.voxo.co";

export function extractMeetTokenFromURL(url: string): string | null {
  const query = url.split("?")[1] ?? "";
  if (!query) return null;

  if (!query.includes("=")) {
    const token = decodeURIComponent(query.split("&")[0] ?? "").trim();
    return token || null;
  }

  const params = new URLSearchParams(query);
  const knownTokenKeys = ["token", "room", "roomId", "id", "t"];
  for (const key of knownTokenKeys) {
    const value = params.get(key);
    if (value?.trim()) return value.trim();
  }

  for (const [, value] of params.entries()) {
    if (value?.trim()) return value.trim();
  }

  return null;
}

export function isMeetDeepLink(url: string | null | undefined): boolean {
  return !!url?.includes(MEET_HOST);
}

export type PendingMeetLink = { url: string; token: string | null };

declare global {
  // eslint-disable-next-line no-var
  var __VOXO_PENDING_MEET_LINK__: PendingMeetLink | undefined;
}

export function setPendingMeetLink(url: string): PendingMeetLink {
  const pending: PendingMeetLink = {
    url,
    token: extractMeetTokenFromURL(url)
  };
  global.__VOXO_PENDING_MEET_LINK__ = pending;
  return pending;
}

export function consumePendingMeetLink(): PendingMeetLink | undefined {
  const pending = global.__VOXO_PENDING_MEET_LINK__;
  if (!pending?.url) return undefined;
  delete global.__VOXO_PENDING_MEET_LINK__;
  return pending;
}

export function peekPendingMeetLink(): PendingMeetLink | undefined {
  return global.__VOXO_PENDING_MEET_LINK__;
}
