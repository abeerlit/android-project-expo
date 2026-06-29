/** Daily room base URL (matches web `Meeting.vue` / meet store). */
export const DAILY_ROOM_BASE_URL = "https://voxo.daily.co";

export const MEET_HOST = "meet.voxo.co";

export const isVoxoMeetUrl = (url: string): boolean =>
  url.toLowerCase().includes(MEET_HOST);

/** Ensure https URL for Meetings screen / API (matches `normalizeMeetUrl` in Meetings.tsx). */
export const normalizeMeetLinkUrl = (url: string): string => {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `https://${trimmed}`;
};

/**
 * meet share keys use `roomId-dialPin`. DB / Daily room name is the prefix before a trailing numeric pin.
 */
export const normalizeMeetRoomKey = (key: string): string => {
  const trimmed = key.trim();
  const lastHyphen = trimmed.lastIndexOf("-");
  if (lastHyphen <= 0) return trimmed;
  const suffix = trimmed.slice(lastHyphen + 1);
  if (/^\d+$/.test(suffix)) {
    return trimmed.slice(0, lastHyphen);
  }
  return trimmed;
};

/**
 * meet.voxo.co links use a key-only query (`?roomId-pin`) or a path segment (`/roomId-pin`).
 */
export const parseRoomIdFromMeetVoxoUrl = (meetURL: string): string | null => {
  if (!isVoxoMeetUrl(meetURL)) return null;

  const normalized = normalizeMeetLinkUrl(meetURL);
  const query = normalized.split("?")[1] ?? "";
  if (query) {
    const first = decodeURIComponent(query.split("&")[0] ?? "").trim();
    if (first) return normalizeMeetRoomKey(first);
  }

  try {
    const u = new URL(normalized);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length > 0) {
      const segment = decodeURIComponent(parts[parts.length - 1] ?? "").trim();
      if (segment) return normalizeMeetRoomKey(segment);
    }
  } catch {
    // ignore invalid URL
  }

  return null;
};
