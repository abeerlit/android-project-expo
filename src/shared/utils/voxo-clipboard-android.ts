import { NativeModules, Platform } from "react-native";

type VoxoClipboardNative = {
  setImageFromFilePath: (filePath: string) => Promise<string>;
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
