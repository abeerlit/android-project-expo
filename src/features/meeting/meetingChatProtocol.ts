/**
 * In-room meeting chat over Daily `sendAppMessage` / `app-message`.
 * Web clients vary: some use `text`, others `message`; some nest under `payload` / `data`.
 * This module normalizes inbound payloads. Mobile sends the same shape as web MeetChat:
 * `{ event: "chat-msg", data: { message, name, date } }`.
 */

export const MEETING_CHAT_APP_ACTION_PRIMARY = "meet-chat" as const;
/** Many web apps use `action: "chat"` and body field `message` instead of `text`. */
export const MEETING_CHAT_APP_ACTION_ALIAS = "chat" as const;

export type MeetingChatMessage = {
  id: string;
  fromSessionId: string;
  senderName: string;
  text: string;
  ts: number;
};

const CHAT_ACTION_OR_TYPE = new Set([
  "meet-chat",
  "chat",
  "meeting-chat",
  "room-chat",
  "chat-message",
  "room_message",
  "room-message",
  "meeting_message",
  "meeting-message",
  "broadcast",
  "broadcast-chat",
  "roomchat",
  "chatsend",
  "send-chat"
]);

function pickStr(o: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function shallowMergeNested(root: Record<string, unknown>): Record<string, unknown> {
  let d = { ...root };
  for (const key of ["payload", "data", "detail"] as const) {
    const inner = root[key];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      d = { ...(inner as Record<string, unknown>), ...d };
    }
  }
  return d;
}

/** Plain chat body: web often uses `message` (string); we also use `text` on mobile. */
export function extractChatBodyText(d: Record<string, unknown>): string | undefined {
  const direct =
    pickStr(d, ["text", "body", "content", "msg"]) ||
    (typeof d.message === "string" ? d.message.trim() : undefined);
  if (direct) return direct;
  if (d.message && typeof d.message === "object" && !Array.isArray(d.message)) {
    return pickStr(d.message as Record<string, unknown>, [
      "text",
      "body",
      "message",
      "content"
    ]);
  }
  return undefined;
}

function pickNumber(o: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "number" && !Number.isNaN(v)) return v;
  }
  return undefined;
}

export type NormalizedInboundMeetingChat = {
  text: string;
  clientMessageId?: string;
  user_name?: string;
  ts?: number;
};

/**
 * Returns parsed chat if this looks like a room chat app message (not reaction / transcription).
 * Accepts common web shapes so mobile and web can share one Daily room.
 */
export function normalizeMeetingChatInbound(
  data: unknown,
  fromId: string | undefined
): NormalizedInboundMeetingChat | null {
  if (!fromId || fromId === "transcription") return null;
  if (!data || typeof data !== "object") return null;

  const d = shallowMergeNested(data as Record<string, unknown>);

  const act = String(d.action ?? "").toLowerCase();
  const typ = String(d.type ?? "").toLowerCase();
  const evt = String(d.event ?? "").toLowerCase();

  if (act === "reaction" || typ === "reaction" || act === "reactions") return null;
  if (typeof d.title === "string" && d.title.length > 0 && act === "reaction") {
    return null;
  }

  const text = extractChatBodyText(d);
  if (!text) return null;

  const markerHit =
    CHAT_ACTION_OR_TYPE.has(act) ||
    CHAT_ACTION_OR_TYPE.has(typ) ||
    CHAT_ACTION_OR_TYPE.has(evt) ||
    act.includes("chat") ||
    typ.includes("chat") ||
    evt.includes("chat");

  /** Web sometimes omits `action` and sends only `{ message, userName }`. */
  const implicitNoAction =
    !act &&
    !typ &&
    !evt &&
    (typeof d.user_name === "string" ||
      typeof d.userName === "string" ||
      typeof d.senderName === "string" ||
      typeof d.displayName === "string");

  /** Bare `{ message: "…" }` without action (some embeds). */
  const implicitBareMessage =
    !act &&
    !typ &&
    !evt &&
    typeof d.message === "string" &&
    d.message.trim().length > 0 &&
    typeof d.title !== "string";

  if (!markerHit && !implicitNoAction && !implicitBareMessage) return null;

  const clientMessageId = pickStr(d, [
    "clientMessageId",
    "messageId",
    "client_id",
    "msgId"
  ]);
  const user_name = pickStr(d, [
    "user_name",
    "userName",
    "senderName",
    "displayName",
    "from",
    "sender",
    "name"
  ]);
  const ts =
    pickNumber(d, ["ts", "timestamp", "time", "t"]) ??
    (typeof d.timestamp === "string" ? Date.parse(d.timestamp) : undefined);

  return {
    text,
    clientMessageId,
    user_name,
    ts: typeof ts === "number" && !Number.isNaN(ts) ? ts : undefined
  };
}

