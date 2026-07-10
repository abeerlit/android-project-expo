import type { AuthParams } from "core/navigation/navigators/AuthenticatedStack.tsx";
import { normalizeMeetRoomKey } from "features/meeting/meetJoinUtils.ts";

export type MeetingNavParams = AuthParams["Meetings"];

const normUrl = (url: string): string => {
  const t = url.trim();
  if (t.startsWith("http://") || t.startsWith("https://")) return t;
  return `https://${t}`;
};

/** Same identity as an in-flight meeting so we can resume the UI on the same Daily call. */
export const paramsMatchMeetingNav = (
  a: MeetingNavParams,
  b: MeetingNavParams
): boolean => {
  if (normUrl(a.meetURL) !== normUrl(b.meetURL)) return false;
  const r1 = a.roomId ? normalizeMeetRoomKey(a.roomId) : "";
  const r2 = b.roomId ? normalizeMeetRoomKey(b.roomId) : "";
  if (r1 !== r2) return false;
  return (a.meetingToken ?? "") === (b.meetingToken ?? "");
};

