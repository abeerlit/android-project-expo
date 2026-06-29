import type { Asset } from "react-native-image-picker";
import { Platform } from "react-native";
import ReactNativeBlobUtil from "react-native-blob-util";

export const MAX_CHAT_IMAGE_BYTES = 20 * 1024 * 1024;
/** SMS/MMS media upload: server accepts max 3 MiB per file. */
export const MAX_SMS_MMS_BYTES = 3 * 1024 * 1024;

function looksLikeBase64Payload(raw: string): boolean {
  const t = raw.replace(/\s/g, "");
  if (t.length < 24) return false;
  const sample = t.slice(0, Math.min(t.length, 4000));
  let ok = 0;
  for (let i = 0; i < sample.length; i++) {
    const c = sample[i];
    if (/[A-Za-z0-9+/=_-]/.test(c)) ok++;
  }
  return ok / sample.length > 0.92;
}

export function parseDataUriBase64Payload(dataUri: string): {
  mimeType: string;
  base64Data: string;
} | null {
  const s = dataUri.trim();
  if (!/^data:/i.test(s)) return null;

  const lower = s.toLowerCase();
  const b64Marker = ";base64,";
  const b64Idx = lower.indexOf(b64Marker);

  let meta: string;
  let rawB64: string;

  if (b64Idx !== -1) {
    meta = s.slice("data:".length, b64Idx).trim();
    rawB64 = s.slice(b64Idx + b64Marker.length).replace(/\s/g, "");
  } else {
    const commaIdx = s.indexOf(",");
    if (commaIdx <= "data:".length) return null;
    meta = s.slice("data:".length, commaIdx).trim();
    rawB64 = s.slice(commaIdx + 1).replace(/\s/g, "");
    if (!looksLikeBase64Payload(rawB64)) {
      return null;
    }
  }

  if (!rawB64) return null;
  const primaryMime = (meta.split(";")[0] ?? "").trim().toLowerCase();
  let mimeType = primaryMime;
  if (
    mimeType === "application/octet-stream" ||
    mimeType === "application/x-www-form-urlencoded" ||
    mimeType === ""
  ) {
    mimeType = "image/jpeg";
  }
  if (!mimeType.startsWith("image/")) {
    return null;
  }
  return { mimeType, base64Data: rawB64 };
}

export function estimateDataUriPayloadBytes(dataUri: string): number {
  const parsed = parseDataUriBase64Payload(dataUri);
  if (!parsed) return 0;
  return Math.floor((parsed.base64Data.length * 3) / 4);
}

export async function dataUriToImageAsset(dataUri: string): Promise<Asset> {
  const parsed = parseDataUriBase64Payload(dataUri);
  if (!parsed) {
    throw new Error("Invalid data:image URI");
  }
  const { mimeType, base64Data } = parsed;
  const ext = mimeType.includes("png")
    ? "png"
    : mimeType.includes("webp")
      ? "webp"
      : mimeType.includes("gif")
        ? "gif"
        : "jpg";
  const fileName = `paste_${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${ext}`;
  const filePath = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${fileName}`;
  await ReactNativeBlobUtil.fs.writeFile(filePath, base64Data, "base64");
  const fileSize = estimateDataUriPayloadBytes(dataUri);
  const uri =
    Platform.OS === "android"
      ? filePath.startsWith("file://")
        ? filePath
        : `file://${filePath}`
      : filePath.startsWith("file://")
        ? filePath
        : `file://${filePath}`;
  return {
    uri,
    fileName,
    type: mimeType,
    fileSize
  };
}
