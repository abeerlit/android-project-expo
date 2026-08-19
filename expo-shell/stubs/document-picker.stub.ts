/**
 * Expo dev shell: avoids RNDocumentPicker TurboModule at import time (not in dev client yet).
 */

export type DocumentPickerResponse = {
  uri: string;
  name?: string | null;
  copyError?: string;
  type?: string | null;
  size?: number | null;
};

const types = {
  allFiles: "*/*",
  audio: "audio/*",
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  images: "image/*",
  pdf: "application/pdf",
  plainText: "text/plain",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  video: "video/*",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip"
};

const DocumentPicker = {
  types,
  isCancel: (_err: unknown) => false,
  isInProgress: (_err: unknown) => false,
  pickSingle: async (): Promise<DocumentPickerResponse> => {
    throw new Error("DocumentPicker is not available in the Expo dev shell.");
  },
  pick: async (): Promise<DocumentPickerResponse[]> => {
    throw new Error("DocumentPicker is not available in the Expo dev shell.");
  },
  releaseSecureAccess: async (): Promise<void> => {}
};

export default DocumentPicker;
