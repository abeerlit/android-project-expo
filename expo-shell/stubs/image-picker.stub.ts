import { toast } from "@backpackapp-io/react-native-toast";

export type Asset = {
  uri?: string;
  fileName?: string;
  type?: string;
  fileSize?: number;
};

export type ImageLibraryOptions = {
  mediaType?: "photo" | "video" | "mixed";
  selectionLimit?: number;
};

export type ImagePickerResponse = {
  didCancel?: boolean;
  errorMessage?: string;
  assets?: Asset[];
};

type Callback = (response: ImagePickerResponse) => void;

const STUB_RESPONSE: ImagePickerResponse = {
  didCancel: true,
  assets: []
};

function notifyStubbed() {
  toast.error(
    "Photo picker is not available. Rebuild the dev client with chat native enabled."
  );
}

function finish(callback?: Callback): ImagePickerResponse {
  notifyStubbed();
  if (typeof callback === "function") {
    callback(STUB_RESPONSE);
  }
  return STUB_RESPONSE;
}

export function launchImageLibrary(
  _options?: ImageLibraryOptions,
  callback?: Callback
): Promise<ImagePickerResponse> {
  return Promise.resolve(finish(callback));
}

export function launchCamera(
  _options?: ImageLibraryOptions,
  callback?: Callback
): Promise<ImagePickerResponse> {
  return Promise.resolve(finish(callback));
}
