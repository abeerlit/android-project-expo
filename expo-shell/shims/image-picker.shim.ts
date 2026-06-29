/**
 * Maps react-native-image-picker → expo-image-picker (lazy-loaded).
 * Do not import expo-image-picker at module scope — it requires ExponentImagePicker
 * in the native binary and will crash app boot if missing.
 */
import { toast } from "@backpackapp-io/react-native-toast";

export type Asset = {
  base64?: string;
  uri?: string;
  width?: number;
  height?: number;
  originalPath?: string;
  fileSize?: number;
  type?: string;
  fileName?: string;
  duration?: number;
};

export type ImageLibraryOptions = {
  mediaType?: "photo" | "video" | "mixed";
  selectionLimit?: number;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
};

export type CameraOptions = ImageLibraryOptions;

export type ImagePickerResponse = {
  didCancel?: boolean;
  errorMessage?: string;
  assets?: Asset[];
};

type Callback = (response: ImagePickerResponse) => void;

type ExpoImagePickerModule = typeof import("expo-image-picker");
type ExpoAsset = import("expo-image-picker").ImagePickerAsset;
type ExpoPickerOptions = import("expo-image-picker").ImagePickerOptions;

let expoPickerPromise: Promise<ExpoImagePickerModule | null> | null = null;

function loadExpoPicker(): Promise<ExpoImagePickerModule | null> {
  if (!expoPickerPromise) {
    expoPickerPromise = import("expo-image-picker")
      .then((mod) => mod)
      .catch(() => null);
  }
  return expoPickerPromise;
}

function mediaTypesFor(
  mediaType?: ImageLibraryOptions["mediaType"]
): ExpoPickerOptions["mediaTypes"] {
  if (mediaType === "photo") return ["images"];
  if (mediaType === "video") return ["videos"];
  return ["images", "videos"];
}

function toAsset(asset: ExpoAsset): Asset {
  const uri = asset.uri;
  const nameFromUri = uri?.split("/").pop();
  return {
    uri,
    fileName: asset.fileName ?? nameFromUri,
    type: asset.mimeType ?? asset.type,
    fileSize: asset.fileSize,
    width: asset.width,
    height: asset.height,
    duration: asset.duration ?? undefined
  };
}

function pickerOptions(options?: ImageLibraryOptions): ExpoPickerOptions {
  const limit = options?.selectionLimit;
  const allowsMultipleSelection = limit === 0 || (limit != null && limit > 1);
  return {
    mediaTypes: mediaTypesFor(options?.mediaType),
    allowsMultipleSelection,
    selectionLimit:
      limit != null && limit > 0 ? limit : allowsMultipleSelection ? 0 : 1,
    quality: options?.quality ?? 1
  };
}

function unavailableResponse(callback?: Callback): ImagePickerResponse {
  toast.error(
    "File picker is not in this dev build. Run npm run android:setup and reinstall the app."
  );
  const response: ImagePickerResponse = { didCancel: true };
  callback?.(response);
  return response;
}

async function ensureLibraryPermission(
  ExpoImagePicker: ExpoImagePickerModule
): Promise<boolean> {
  const current = await ExpoImagePicker.getMediaLibraryPermissionsAsync();
  if (current.granted) return true;
  const requested = await ExpoImagePicker.requestMediaLibraryPermissionsAsync();
  if (!requested.granted) {
    toast.error("Photo library permission is required to attach files.");
    return false;
  }
  return true;
}

async function ensureCameraPermission(
  ExpoImagePicker: ExpoImagePickerModule
): Promise<boolean> {
  const current = await ExpoImagePicker.getCameraPermissionsAsync();
  if (current.granted) return true;
  const requested = await ExpoImagePicker.requestCameraPermissionsAsync();
  if (!requested.granted) {
    toast.error("Camera permission is required to take photos.");
    return false;
  }
  return true;
}

async function runLibrary(
  options?: ImageLibraryOptions,
  callback?: Callback
): Promise<ImagePickerResponse> {
  const ExpoImagePicker = await loadExpoPicker();
  if (!ExpoImagePicker) {
    return unavailableResponse(callback);
  }

  try {
    if (!(await ensureLibraryPermission(ExpoImagePicker))) {
      const denied: ImagePickerResponse = {
        didCancel: true,
        errorMessage: "permission denied"
      };
      callback?.(denied);
      return denied;
    }

    const result = await ExpoImagePicker.launchImageLibraryAsync(
      pickerOptions(options)
    );

    const response: ImagePickerResponse = result.canceled
      ? { didCancel: true, assets: [] }
      : { assets: (result.assets ?? []).map(toAsset) };

    callback?.(response);
    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Image picker unavailable";
    if (/native module|ExponentImagePicker/i.test(message)) {
      return unavailableResponse(callback);
    }
    toast.error("Could not open photo library.");
    const failed: ImagePickerResponse = { errorMessage: message, didCancel: true };
    callback?.(failed);
    return failed;
  }
}

export function launchImageLibrary(
  options?: ImageLibraryOptions,
  callback?: Callback
): Promise<ImagePickerResponse> {
  return runLibrary(options, callback);
}

export async function launchCamera(
  options?: ImageLibraryOptions,
  callback?: Callback
): Promise<ImagePickerResponse> {
  const ExpoImagePicker = await loadExpoPicker();
  if (!ExpoImagePicker) {
    return unavailableResponse(callback);
  }

  try {
    if (!(await ensureCameraPermission(ExpoImagePicker))) {
      const denied: ImagePickerResponse = {
        didCancel: true,
        errorMessage: "permission denied"
      };
      callback?.(denied);
      return denied;
    }

    const result = await ExpoImagePicker.launchCameraAsync(pickerOptions(options));
    const response: ImagePickerResponse = result.canceled
      ? { didCancel: true, assets: [] }
      : { assets: (result.assets ?? []).map(toAsset) };

    callback?.(response);
    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Camera unavailable";
    if (/native module|ExponentImagePicker/i.test(message)) {
      return unavailableResponse(callback);
    }
    toast.error("Could not open camera.");
    const failed: ImagePickerResponse = { errorMessage: message, didCancel: true };
    callback?.(failed);
    return failed;
  }
}
