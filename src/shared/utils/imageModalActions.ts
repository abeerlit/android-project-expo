import { Platform, Share } from "react-native";
import ReactNativeBlobUtil from "react-native-blob-util";
import Clipboard from "@react-native-clipboard/clipboard";
import { CameraRoll } from "@react-native-camera-roll/camera-roll";
import { toast } from "@backpackapp-io/react-native-toast";
import {
  isAndroidClipboardImageSupported,
  isAndroidFileShareSupported,
  setAndroidClipboardImageFromFile,
  shareAndroidFile
} from "shared/utils/voxo-clipboard-android.ts";

function buildAuthHeaders(authToken?: string): Record<string, string> {
  if (!authToken) return {};
  return { Authorization: `Bearer ${authToken}` };
}

function stripFileScheme(uri: string): string {
  return uri.replace(/^file:\/\//, "");
}

function extensionFromUri(uri: string): string {
  try {
    const withoutQuery = uri.split("?")[0] || "";
    const match = withoutQuery.match(/(\.[a-z0-9]{2,8})$/i);
    return match?.[1]?.toLowerCase() || ".jpg";
  } catch {
    return ".jpg";
  }
}

function mimeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".heic":
      return "image/heic";
    case ".heif":
      return "image/heif";
    case ".pdf":
      return "application/pdf";
    case ".jpg":
      return "image/jpg";
    case ".jpeg":
      return "image/jpeg";
    default:
      return "image/jpeg";
  }
}

function toFileUri(path: string): string {
  return path.startsWith("file://") ? path : `file://${path}`;
}

async function resolveImagePath(
  uri: string,
  authToken?: string,
  uniqueName?: boolean
): Promise<{ path: string; cleanup: boolean }> {
  const path = stripFileScheme(uri);
  if (
    (uri.startsWith("file://") || path.startsWith("/")) &&
    (await ReactNativeBlobUtil.fs.exists(path))
  ) {
    return { path, cleanup: false };
  }

  const ext = extensionFromUri(uri);
  const fileName = uniqueName
    ? `forwardImage_${Date.now()}${ext}`
    : `tempImage${ext}`;
  const tempPath = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${fileName}`;
  const headers = buildAuthHeaders(authToken);
  const res = await ReactNativeBlobUtil.config({
    fileCache: true,
    path: tempPath
  }).fetch("GET", uri, headers);

  return { path: res.path(), cleanup: true };
}

export type PreparedImageFile = {
  uri: string;
  path: string;
  name: string;
  type: string;
  cleanup: boolean;
};

export async function prepareRemoteFile(
  fileUri: string,
  authToken?: string,
  originalName?: string,
  mimeType?: string
): Promise<PreparedImageFile> {
  const { path, cleanup } = await resolveImagePath(fileUri, authToken, true);
  const ext = extensionFromUri(originalName || path || fileUri);
  return {
    uri: toFileUri(path),
    path,
    name: originalName || `forwarded-file${ext}`,
    type: mimeType || mimeFromExt(ext),
    cleanup
  };
}

export async function prepareImageFile(
  imageUri: string,
  authToken?: string
): Promise<PreparedImageFile> {
  return prepareRemoteFile(imageUri, authToken, undefined, undefined);
}

export function cleanupPreparedImage(file: PreparedImageFile): void {
  if (!file.cleanup) return;
  void ReactNativeBlobUtil.fs.unlink(file.path).catch(() => {});
}

export async function shareTextWithSystemSheet(text: string): Promise<void> {
  try {
    await Share.share({ message: text });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/user.*(did not|cancel)/i.test(message)) return;
    console.error("Error sharing text:", error);
    toast.error("Failed to share");
  }
}

export async function shareImageWithSystemSheet(
  imageUri: string,
  authToken?: string
): Promise<void> {
  try {
    const prepared = await prepareImageFile(imageUri, authToken);
    if (Platform.OS === "android" && isAndroidFileShareSupported()) {
      await shareAndroidFile(prepared.path, prepared.type, "Forward image");
    } else {
      await Share.share(
        Platform.OS === "ios"
          ? { url: prepared.uri }
          : { title: "Forward image", message: prepared.uri, url: prepared.uri }
      );
    }
    setTimeout(() => cleanupPreparedImage(prepared), 60_000);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/user.*(did not|cancel)/i.test(message)) return;
    console.error("Error sharing image:", error);
    toast.error("Failed to share image");
  }
}

export async function copyImageToClipboard(
  imageUri: string,
  authToken?: string
): Promise<void> {
  try {
    const { path, cleanup } = await resolveImagePath(imageUri, authToken);

    if (Platform.OS === "android") {
      if (!isAndroidClipboardImageSupported()) {
        toast.error("Image copy is not available on this device");
        return;
      }
      await setAndroidClipboardImageFromFile(path);
    } else {
      const base64String = await ReactNativeBlobUtil.fs.readFile(path, "base64");
      Clipboard.setImage(base64String);
    }

    toast.success("Image copied to clipboard!");

    if (cleanup) {
      await ReactNativeBlobUtil.fs.unlink(path).catch(() => {});
    }
  } catch (error) {
    console.error("Error copying image to clipboard:", error);
    toast.error("Failed to copy image to clipboard");
  }
}

export async function saveImageToCameraRoll(
  imageUri: string,
  authToken?: string
): Promise<void> {
  try {
    const { path, cleanup } = await resolveImagePath(imageUri, authToken);
    await CameraRoll.saveToCameraRoll(path, "photo");
    toast.success("Image saved to camera roll!");
    if (cleanup) {
      await ReactNativeBlobUtil.fs.unlink(path).catch(() => {});
    }
  } catch (error) {
    console.error("Error saving image to camera roll:", error);
    toast.error("Failed to save image to camera roll");
  }
}
