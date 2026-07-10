import { Platform } from "react-native";
import ReactNativeBlobUtil from "react-native-blob-util";
import Clipboard from "@react-native-clipboard/clipboard";
import { CameraRoll } from "@react-native-camera-roll/camera-roll";
import { toast } from "@backpackapp-io/react-native-toast";
import {
  isAndroidClipboardImageSupported,
  setAndroidClipboardImageFromFile
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

async function resolveImagePath(
  uri: string,
  authToken?: string
): Promise<{ path: string; cleanup: boolean }> {
  const path = stripFileScheme(uri);
  if (
    (uri.startsWith("file://") || path.startsWith("/")) &&
    (await ReactNativeBlobUtil.fs.exists(path))
  ) {
    return { path, cleanup: false };
  }

  const ext = extensionFromUri(uri);
  const tempPath = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/tempImage${ext}`;
  const headers = buildAuthHeaders(authToken);
  const res = await ReactNativeBlobUtil.config({
    fileCache: true,
    path: tempPath
  }).fetch("GET", uri, headers);

  return { path: res.path(), cleanup: true };
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
