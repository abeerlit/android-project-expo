require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const {
  wrapWithReanimatedMetroConfig
} = require("react-native-reanimated/metro-config");
const {
  getMetroStubPaths,
  getNativeRealAliases,
  resolveMetroStub
} = require("./expo-shell/expoAliases.js");

const projectRoot = __dirname;
const srcRoot = path.join(projectRoot, "src");
const expoNodeModules = path.resolve(projectRoot, "node_modules");
const eventTargetShimV5 = path.join(
  expoNodeModules,
  "event-target-shim/dist/event-target-shim.js"
);
const eventTargetShimV6 = path.join(
  expoNodeModules,
  "@daily-co/react-native-webrtc/node_modules/event-target-shim/index.js"
);
const webrtcModuleEntry = path.join(
  expoNodeModules,
  "@daily-co/react-native-webrtc/lib/module/index.js"
);
const webrtcTrackEventEntry = path.join(
  expoNodeModules,
  "@daily-co/react-native-webrtc/lib/module/RTCTrackEvent.js"
);
const webrtcPkgSegment = `${path.sep}@daily-co${path.sep}react-native-webrtc${path.sep}`;
const stubs = getMetroStubPaths();

const sharedSrcPrefixes = [
  "shared/",
  "store/",
  "core/",
  "features/",
  "hooks/",
  "components/",
  "helpers/",
  "api/",
  "layouts/",
  "navigations/",
  "router/",
  "types/",
  "views/",
  "assets/"
];
const voxoSoftphoneContext = path.join(
  projectRoot,
  "expo-shell/voxoSoftphoneContext.ts"
);
const voxoUseSoftphone = path.join(projectRoot, "expo-shell/useSoftphone.ts");
const softphoneDirSegment = `${path.sep}core${path.sep}softphone${path.sep}`;
const trySourceExts = ["", ".ts", ".tsx", ".js", ".jsx"];

function resolveCanonicalSoftphoneModules(context, moduleName) {
  if (
    moduleName === "core/softphone/useSoftphone" ||
    moduleName === "core/softphone/useSoftphone.ts"
  ) {
    return fs.existsSync(voxoUseSoftphone)
      ? { filePath: voxoUseSoftphone, type: "sourceFile" }
      : null;
  }
  const isContextModule =
    moduleName === "core/softphone/SoftphoneContext" ||
    moduleName === "core/softphone/SoftphoneContext.ts" ||
    moduleName === "./SoftphoneContext" ||
    moduleName === "./SoftphoneContext.ts" ||
    moduleName.endsWith("/voxoSoftphoneContext") ||
    moduleName.endsWith("/voxoSoftphoneContext.ts");
  if (!isContextModule) return null;
  const origin = context.originModulePath || "";
  if (
    moduleName.startsWith("./") &&
    !path.normalize(origin).includes(softphoneDirSegment) &&
    !path.normalize(origin).includes(`${path.sep}expo-shell${path.sep}`)
  ) {
    return null;
  }
  return fs.existsSync(voxoSoftphoneContext)
    ? { filePath: voxoSoftphoneContext, type: "sourceFile" }
    : null;
}

function resolveSharedSrcModule(moduleName) {
  if (!sharedSrcPrefixes.some((p) => moduleName.startsWith(p))) {
    return null;
  }
  if (!fs.existsSync(srcRoot)) return null;
  const baseName = moduleName.replace(/\.(tsx?|jsx?)$/, "");
  for (const ext of trySourceExts) {
    const candidate = path.join(srcRoot, baseName + ext);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

const reduxSagaCjs = path.join(expoNodeModules, "redux-saga/dist/redux-saga.cjs.js");
const reduxSagaCoreCjs = path.join(
  expoNodeModules,
  "@redux-saga/core/dist/redux-saga-core.cjs.js"
);
const reduxSagaEffectsCjs = path.join(
  expoNodeModules,
  "@redux-saga/core/effects/dist/redux-saga-core-effects.cjs.js"
);

const config = getDefaultConfig(projectRoot);

config.watchFolders = [projectRoot];
config.resolver.nodeModulesPaths = [expoNodeModules];
config.resolver.disableHierarchicalLookup = true;
config.resolver.blockList = [/[/\\]ios-project[/\\]node_modules[/\\]/];
config.resolver.unstable_enableSymlinks = false;
config.resolver.unstable_enablePackageExports = false;
config.resolver.extraNodeModules = {
  "redux-saga": path.dirname(reduxSagaCjs),
  "@redux-saga/core": path.join(expoNodeModules, "@redux-saga/core"),
  ...getNativeRealAliases()
};

const { assetExts, sourceExts } = config.resolver;
const originalResolveRequest = config.resolver.resolveRequest;

const entitiesDecode = path.join(expoNodeModules, "entities/dist/decode.js");
const entitiesEncode = path.join(expoNodeModules, "entities/dist/encode.js");

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const softphoneModule = resolveCanonicalSoftphoneModules(context, moduleName);
  if (softphoneModule) {
    return softphoneModule;
  }
  const sharedSrcFile = resolveSharedSrcModule(moduleName);
  if (sharedSrcFile) {
    return { filePath: sharedSrcFile, type: "sourceFile" };
  }
  if (
    moduleName === "@daily-co/react-native-webrtc/lib/typescript/RTCTrackEvent" &&
    fs.existsSync(webrtcTrackEventEntry)
  ) {
    return { filePath: webrtcTrackEventEntry, type: "sourceFile" };
  }
  if (moduleName === "event-target-shim") {
    const origin = context.originModulePath || "";
    if (origin.includes(webrtcPkgSegment) && fs.existsSync(eventTargetShimV6)) {
      return { filePath: eventTargetShimV6, type: "sourceFile" };
    }
    if (fs.existsSync(eventTargetShimV5)) {
      return { filePath: eventTargetShimV5, type: "sourceFile" };
    }
  }
  if (moduleName === "@daily-co/react-native-webrtc") {
    return { filePath: webrtcModuleEntry, type: "sourceFile" };
  }
  if (moduleName === "entities/decode") {
    return { filePath: entitiesDecode, type: "sourceFile" };
  }
  if (moduleName === "entities/encode") {
    return { filePath: entitiesEncode, type: "sourceFile" };
  }
  if (moduleName === "redux-saga") {
    return { filePath: reduxSagaCjs, type: "sourceFile" };
  }
  if (moduleName === "@redux-saga/core") {
    return { filePath: reduxSagaCoreCjs, type: "sourceFile" };
  }
  if (moduleName === "redux-saga/effects" || moduleName === "@redux-saga/core/effects") {
    return { filePath: reduxSagaEffectsCjs, type: "sourceFile" };
  }
  const stubPath = resolveMetroStub(moduleName, stubs, platform);
  if (stubPath) {
    return { filePath: stubPath, type: "sourceFile" };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve("react-native-svg-transformer/react-native")
};

config.resolver.assetExts = assetExts.filter((ext) => ext !== "svg");
config.resolver.sourceExts = [...sourceExts, "svg"];

module.exports = wrapWithReanimatedMetroConfig(config);
