import { BaseMessage } from "@sendbird/chat/message";
import { ChatMessage } from "features/chat/types.ts";

const IMAGE_FILENAME_RE =
  /^[\w.+-]+\.(png|jpe?g|gif|webp|heic|heif|bmp|tiff?)$/i;

type EditableMessageLike = Pick<BaseMessage, "messageType" | "customType"> & {
  message?: string;
  sender?: { userId?: string };
  isUserMessage?: () => boolean;
  isFileMessage?: () => boolean;
  isMultipleFilesMessage?: () => boolean;
};

function isUserType(message: EditableMessageLike): boolean {
  if (typeof message.isFileMessage === "function" && message.isFileMessage()) {
    return false;
  }
  if (
    typeof message.isMultipleFilesMessage === "function" &&
    message.isMultipleFilesMessage()
  ) {
    return false;
  }
  if (typeof message.isUserMessage === "function") {
    return message.isUserMessage();
  }
  return message.messageType === "user";
}

export function stripMediaFromHtml(html: string): string {
  return html
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/<video\b[^>]*>[\s\S]*?<\/video>/gi, "")
    .replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi, "");
}

export function visibleTextFromHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isStandaloneImageFileName(text: string): boolean {
  return IMAGE_FILENAME_RE.test(text.trim());
}

/** HTML to load into the editor, or null if this message should not be edited. */
export function getEditableMessageHtml(
  message: EditableMessageLike | null | undefined
): string | null {
  if (!message || !isUserType(message)) {
    return null;
  }
  if (
    message.customType === "MESSAGE_GIF" ||
    message.customType === "MEETING_INVITE"
  ) {
    return null;
  }

  const raw = typeof message.message === "string" ? message.message : "";
  const stripped = stripMediaFromHtml(raw);
  const visible = visibleTextFromHtml(stripped);
  if (!visible || isStandaloneImageFileName(visible)) {
    return null;
  }
  return stripped;
}

export function canEditChatMessage(
  message: ChatMessage | EditableMessageLike,
  currentUserId?: string | number | null
): boolean {
  if (currentUserId == null || currentUserId === "") {
    return false;
  }
  if (message.sender?.userId !== String(currentUserId)) {
    return false;
  }
  return getEditableMessageHtml(message) !== null;
}
