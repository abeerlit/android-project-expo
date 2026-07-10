import { Asset } from "react-native-image-picker";
import {
  MAX_CHAT_IMAGE_BYTES,
  dataUriToImageAsset,
  estimateDataUriPayloadBytes
} from "features/chat/rich-editor/pasteImageUtils.ts";

export type PastedImagePayload = {
  dataUrl: string;
  mimeType: string;
  fileName: string;
  fileSize?: number;
};

export const pastedImagePayloadToAsset = async (
  payload: PastedImagePayload,
  maxBytes: number = MAX_CHAT_IMAGE_BYTES
): Promise<Asset> => {
  const fileSize =
    payload.fileSize && payload.fileSize > 0
      ? payload.fileSize
      : estimateDataUriPayloadBytes(payload.dataUrl);

  if (fileSize > maxBytes) {
    throw new Error("FILE_TOO_LARGE");
  }

  const asset = await dataUriToImageAsset(payload.dataUrl);
  const baseName =
    payload.fileName?.replace(/\.[^.]+$/, "") || asset.fileName?.replace(/\.[^.]+$/, "");
  const ext = asset.fileName?.split(".").pop() || "jpg";

  return {
    ...asset,
    fileName: baseName ? `${baseName}-${Date.now()}.${ext}` : asset.fileName,
    fileSize: asset.fileSize ?? fileSize
  };
};
