import type { SendbirdChatWith } from "@sendbird/chat";
import type { GroupChannelModule } from "@sendbird/chat/groupChannel";
import type { Dispatch } from "redux";
import { uploadMediaFiles } from "shared/api/messaging/methods.ts";
import * as textActions from "store/text/actions.ts";
import {
  MAX_CHAT_IMAGE_BYTES,
  MAX_SMS_MMS_BYTES
} from "features/chat/rich-editor/pasteImageUtils.ts";
import type { SharedMediaItem } from "core/navigation/types/types.ts";
import type { ShareDestination } from "features/share/types.ts";
import type { ProvisionedNumber } from "shared/api/messaging/types.ts";
import { Logger } from "shared/utils/Logger.ts";

const logger = new Logger("ShareToChat: ");

export type SendSharedMediaResult =
  | { ok: true; navigateTo: { route: string; params: object } }
  | { ok: false; error: string };

type SendbirdInstance = SendbirdChatWith<GroupChannelModule[]> | null;

function validateSizes(
  media: SharedMediaItem[],
  maxBytes: number,
  label: string
): string | null {
  for (const item of media) {
    if (item.fileSize != null && item.fileSize > maxBytes) {
      const mb = Math.round(maxBytes / (1024 * 1024));
      return `${label} files must be ${mb} MB or smaller`;
    }
  }
  return null;
}

async function sendFileToChannel(
  channel: {
    sendFileMessage: (params: {
      file: { uri: string; name: string; type: string };
      fileName?: string;
      mimeType?: string;
      fileSize?: number;
    }) => {
      onSucceeded: (cb: () => void) => {
        onFailed: (cb: (e: Error) => void) => unknown;
      };
    } | null;
  },
  file: { uri: string; name: string; type: string; fileSize?: number }
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const handler = channel.sendFileMessage({
      file: { uri: file.uri, name: file.name, type: file.type },
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.fileSize
    });
    if (!handler) {
      reject(new Error("Failed to start file send"));
      return;
    }
    handler.onSucceeded(() => resolve()).onFailed((error) => reject(error));
  });
}

async function sendCaptionToChannel(
  channel: {
    sendUserMessage: (params: { message: string }) => {
      onSucceeded: (cb: () => void) => {
        onFailed: (cb: (e: Error) => void) => unknown;
      };
    } | null;
  },
  caption: string
): Promise<void> {
  const trimmed = caption.trim();
  if (!trimmed) return;
  await new Promise<void>((resolve, reject) => {
    const handler = channel.sendUserMessage({ message: trimmed });
    if (!handler) {
      reject(new Error("Failed to start caption send"));
      return;
    }
    handler.onSucceeded(() => resolve()).onFailed((error) => reject(error));
  });
}

export async function sendSharedMedia(options: {
  media: SharedMediaItem[];
  destination: ShareDestination;
  caption: string;
  accessToken: string | null | undefined;
  selectedDidNumber: ProvisionedNumber | null;
  sendbirdInstance: SendbirdInstance;
  dispatch: Dispatch;
}): Promise<SendSharedMediaResult> {
  const {
    media,
    destination,
    caption,
    accessToken,
    selectedDidNumber,
    sendbirdInstance,
    dispatch
  } = options;

  if (!media.length) {
    return { ok: false, error: "No media to send" };
  }

  if (destination.kind === "sendbird") {
    const sizeError = validateSizes(media, MAX_CHAT_IMAGE_BYTES, "Chat");
    if (sizeError) return { ok: false, error: sizeError };

    if (!sendbirdInstance?.groupChannel) {
      return { ok: false, error: "Chat is not connected. Try again shortly." };
    }

    try {
      const channel = await sendbirdInstance.groupChannel.getChannel(
        destination.channelUrl
      );

      for (const item of media) {
        await sendFileToChannel(channel, {
          uri: item.uri,
          name: item.fileName,
          type: item.mimeType,
          fileSize: item.fileSize ?? undefined
        });
      }

      if (caption.trim()) {
        await sendCaptionToChannel(channel, caption);
      }

      return {
        ok: true,
        navigateTo: {
          route: "Chat",
          params: { channelUrl: destination.channelUrl }
        }
      };
    } catch (error) {
      logger.error("Sendbird share send failed", error);
      const message =
        error instanceof Error ? error.message : "Failed to send media";
      return {
        ok: false,
        error: /reconnect/i.test(message)
          ? "Chat is reconnecting. Please try again."
          : message
      };
    }
  }

  // SMS / MMS
  const sizeError = validateSizes(media, MAX_SMS_MMS_BYTES, "SMS/MMS");
  if (sizeError) return { ok: false, error: sizeError };

  if (!accessToken?.trim()) {
    return { ok: false, error: "Not signed in" };
  }
  if (!selectedDidNumber?.number) {
    return { ok: false, error: "Please select a phone number to send from" };
  }

  const recipients = destination.participants
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p && p !== destination.sourceDID)
    .map((p) => p.replace(/^1+/, ""));

  if (recipients.length === 0) {
    return { ok: false, error: "No valid recipient found" };
  }

  const sender = selectedDidNumber.number.replace(/^1+/, "");
  const filesToUpload = media.map((item) => ({
    uri: item.uri,
    name: item.fileName || `file_${Date.now()}`,
    type: item.mimeType || "image/jpeg"
  }));

  try {
    const mediaUrls = await uploadMediaFiles(accessToken, filesToUpload);
    if (!mediaUrls?.length) {
      return { ok: false, error: "Upload failed. Please try again." };
    }

    dispatch(
      textActions.sendTextMessage(
        recipients,
        sender,
        caption.trim(),
        mediaUrls
      )
    );

    return {
      ok: true,
      navigateTo: {
        route: "TextThread",
        params: { conversationId: destination.conversationId }
      }
    };
  } catch (error) {
    logger.error("SMS share send failed", error);
    const message =
      error instanceof Error ? error.message : "Failed to send media";
    return { ok: false, error: message };
  }
}
