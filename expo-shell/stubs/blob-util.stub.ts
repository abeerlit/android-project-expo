const ReactNativeBlobUtil = {
  fs: {
    dirs: { DocumentDir: "", CacheDir: "" },
    exists: async () => false,
    readFile: async () => "",
    writeFile: async () => {},
    unlink: async () => {}
  },
  config: () => ({ fetch: async () => ({ data: "" }) }),
  fetch: async () => ({ data: "" })
};

export default ReactNativeBlobUtil;
