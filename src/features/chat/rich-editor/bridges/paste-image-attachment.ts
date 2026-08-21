import { Platform } from "react-native";
import { Asset } from "react-native-image-picker";
import { getAndroidClipboardImageFile } from "shared/utils/voxo-clipboard-android.ts";
import {
  MAX_CHAT_IMAGE_BYTES,
  dataUriToImageAsset,
  estimateDataUriPayloadBytes
} from "features/chat/rich-editor/pasteImageUtils.ts";

export type PastedImagePayload = {
  dataUrl?: string;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
};

function toFileUri(path: string): string {
  return path.startsWith("file://") ? path : `file://${path}`;
}

async function androidClipboardToAsset(maxBytes: number): Promise<Asset | null> {
  if (Platform.OS !== "android") return null;
  const file = await getAndroidClipboardImageFile();
  if (!file) return null;
  if (file.fileSize > maxBytes) {
    throw new Error("FILE_TOO_LARGE");
  }
  return {
    uri: toFileUri(file.path),
    fileName: file.fileName,
    type: file.mimeType,
    fileSize: file.fileSize
  };
}

export const pastedImagePayloadToAsset = async (
  payload: PastedImagePayload,
  maxBytes: number = MAX_CHAT_IMAGE_BYTES
): Promise<Asset> => {
  const fromClipboard = await androidClipboardToAsset(maxBytes);
  if (fromClipboard) return fromClipboard;

  if (!payload.dataUrl) {
    throw new Error("Invalid pasted image");
  }

  const fileSize =
    payload.fileSize && payload.fileSize > 0
      ? payload.fileSize
      : estimateDataUriPayloadBytes(payload.dataUrl);

  if (fileSize > maxBytes) {
    throw new Error("FILE_TOO_LARGE");
  }

  const asset = await dataUriToImageAsset(payload.dataUrl);
  const baseName =
    payload.fileName?.replace(/\.[^.]+$/, "") ||
    asset.fileName?.replace(/\.[^.]+$/, "");
  const ext = asset.fileName?.split(".").pop() || "jpg";

  return {
    ...asset,
    fileName: baseName ? `${baseName}-${Date.now()}.${ext}` : asset.fileName,
    fileSize: asset.fileSize ?? fileSize
  };
};
