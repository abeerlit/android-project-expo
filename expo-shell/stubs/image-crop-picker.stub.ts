const unavailable = (): Promise<never> =>
  Promise.reject(new Error("Image crop picker is not available in the Expo dev shell."));

const ImageCropPicker = {
  openPicker: unavailable,
  openCamera: unavailable,
  openCropper: unavailable,
  clean: () => Promise.resolve(),
  cleanSingle: () => Promise.resolve()
};

export default ImageCropPicker;
