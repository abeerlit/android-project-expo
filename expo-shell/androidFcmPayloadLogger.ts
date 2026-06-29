/**
 * Structured FCM payload logs for background / headless (killed wake) debugging.
 * Safe for Metro and adb logcat — long values are truncated.
 */
import { AppState } from "react-native";

const LOG_RELEASE = true;
const MAX_STRING_LEN = 280;
const MAX_SENDBIRD_JSON_LEN = 400;

export type FcmRemoteMessageForLog = {
  messageId?: string;
  data?: Record<string, string>;
  notification?: { title?: string; body?: string };
  sentTime?: number;
  ttl?: number;
  from?: string;
  collapseKey?: string;
};

function logRelease(...args: unknown[]) {
  if (LOG_RELEASE) {
    console.log(...args);
  }
}

function truncate(value: unknown, max = MAX_STRING_LEN): string {
  if (value == null) return "";
  const s = typeof value === "string" ? value : JSON.stringify(value);
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…(${s.length} chars)`;
}

function redactDataForLog(
  data: Record<string, string> | undefined
): Record<string, string> {
  if (!data) return {};
  const out: Record<string, string> = {};
  for (const key of Object.keys(data).sort()) {
    const lower = key.toLowerCase();
    if (
      lower.includes("token") ||
      lower.includes("password") ||
      lower.includes("secret")
    ) {
      out[key] = "[redacted]";
      continue;
    }
    if (key === "sendbird") {
      out[key] = truncate(data[key], MAX_SENDBIRD_JSON_LEN);
      continue;
    }
    out[key] = truncate(data[key]);
  }
  return out;
}

function parseSendbirdSummary(raw: string | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const sb = typeof raw === "string" ? JSON.parse(raw) : raw;
    return {
      message_id: sb?.message_id,
      channel_url: sb?.channel?.channel_url,
      channel_name: sb?.channel?.name,
      channel_custom_type:
        sb?.channel?.custom_type ?? sb?.channel?.customType,
      sender_id: sb?.sender?.userId ?? sb?.sender?.id,
      sender_name: sb?.sender?.name ?? sb?.sender?.nickname,
      message_type: sb?.type ?? sb?.message_type ?? sb?.messageType,
      custom_type: sb?.custom_type,
      message_preview: truncate(
        typeof sb?.message === "string"
          ? sb.message.replace(/<[^>]*>/g, "").trim()
          : "",
        120
      )
    };
  } catch (e) {
    return { parseError: String(e) };
  }
}

function classifyPayload(data: Record<string, string>) {
  const vmPayloadType = data.vm_payload_type ?? "";
  const clickAction = data.click_action ?? "";
  const ignorePush = data.ignorePush === "true" || data.ignorePush === "1";

  const isCall =
    !!data.callUuid ||
    !!data.uuid ||
    vmPayloadType === "incoming_call_notification" ||
    !!data.payload_callUuid;

  const isSms =
    clickAction === "TEXT-RECEIVED" ||
    !!data.conversationId ||
    !!data.conversation_id ||
    !!data.reference_id;

  const isSendbird = !!data.sendbird;
  const isVoicemail =
    vmPayloadType === "voicemail" ||
    vmPayloadType === "voicemail_notification" ||
    clickAction === "VOICEMAIL-RECEIVED" ||
    clickAction === "voicemail-received";

  let kind = "other";
  if (isCall) kind = "call";
  else if (isSendbird) kind = "sendbird";
  else if (isSms) kind = "sms";
  else if (isVoicemail) kind = "voicemail";

  return {
    kind,
    isCall,
    isSendbird,
    isSms,
    isVoicemail,
    ignorePush,
    clickAction,
    vmPayloadType
  };
}

/** Log full incoming FCM shape when background handler runs (also used after killed wake). */
export function logAndroidFcmPayloadReceived(
  remoteMessage: FcmRemoteMessageForLog,
  phase: "handler_entry" | "processor_entry" | "processor_outcome"
) {
  const appState = AppState.currentState;
  const data = remoteMessage.data ?? {};
  const classification = classifyPayload(data);
  const hasSystemNotification = !!remoteMessage.notification;

  const base = {
    phase,
    /** Killed vs background: JS only sees AppState after wake; both are non-active. */
    appState,
    deliveryContext:
      appState === "active"
        ? "foreground"
        : "background_or_headless_killed_wake",
    fcmMessageId: remoteMessage.messageId,
    hasDataPayload: Object.keys(data).length > 0,
    dataKeyCount: Object.keys(data).length,
    dataKeys: Object.keys(data).sort(),
    hasSystemNotificationBlock: hasSystemNotification,
    systemNotification: hasSystemNotification
      ? {
          title: remoteMessage.notification?.title ?? null,
          body: truncate(remoteMessage.notification?.body ?? "", 200)
        }
      : null,
    sentTime: remoteMessage.sentTime ?? null,
    ttl: remoteMessage.ttl ?? null,
    from: remoteMessage.from ?? null,
    collapseKey: remoteMessage.collapseKey ?? null,
    classification
  };

  if (phase === "handler_entry") {
    logRelease("📥 [FCM Payload] received", base);
    logRelease("📥 [FCM Payload] data (truncated)", redactDataForLog(data));
    if (classification.isSendbird) {
      logRelease(
        "📥 [FCM Payload] sendbird summary",
        parseSendbirdSummary(data.sendbird)
      );
    }
    return;
  }

  if (phase === "processor_entry") {
    logRelease("📥 [FCM Payload] processor start", base);
    return;
  }

  logRelease("📥 [FCM Payload] processor outcome", base);
}

export function logAndroidFcmProcessorStep(
  step: string,
  detail?: Record<string, unknown>
) {
  logRelease(`📥 [FCM Payload] step: ${step}`, detail ?? {});
}
