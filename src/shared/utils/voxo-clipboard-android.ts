import { NativeModules, Platform } from "react-native";

type AndroidClipboardImageFile = {
  path: string;
  mimeType: string;
  fileName: string;
  fileSize: number;
};

type VoxoClipboardNative = {
  setImageFromFilePath: (filePath: string) => Promise<string>;
  copyClipboardImageToCache?: () => Promise<AndroidClipboardImageFile>;
  shareFile?: (
    filePath: string,
    mimeType: string,
    title: string
  ) => Promise<boolean>;
};

const nativeModule = NativeModules.VoxoClipboard as
  | VoxoClipboardNative
  | undefined;

/** Copy a local image file to the system clipboard (Android only). */
export const setAndroidClipboardImageFromFile = async (
  filePath: string
): Promise<void> => {
  if (Platform.OS !== "android") {
    throw new Error("setAndroidClipboardImageFromFile is Android-only");
  }
  if (!nativeModule?.setImageFromFilePath) {
    throw new Error("VoxoClipboard native module is not available");
  }
  await nativeModule.setImageFromFilePath(filePath);
};

export const isAndroidClipboardImageSupported = (): boolean =>
  Platform.OS === "android" && !!nativeModule?.setImageFromFilePath;

export const getAndroidClipboardImageFile = async (): Promise<
  AndroidClipboardImageFile | null
> => {
  if (Platform.OS !== "android" || !nativeModule?.copyClipboardImageToCache) {
    return null;
  }
  try {
    return await nativeModule.copyClipboardImageToCache();
  } catch {
    return null;
  }
};

export const isAndroidFileShareSupported = (): boolean =>
  Platform.OS === "android" && typeof nativeModule?.shareFile === "function";

export const shareAndroidFile = async (
  filePath: string,
  mimeType: string,
  title = "Share"
): Promise<void> => {
  if (!isAndroidFileShareSupported() || !nativeModule?.shareFile) {
    throw new Error("File share is not available on this device");
  }
  await nativeModule.shareFile(filePath, mimeType, title);
};
