const { getBabelAliases } = require("./expo-shell/expoAliases.js");

module.exports = function (api) {
  api.cache.using(
    () =>
      [
        process.env.EXPO_PUBLIC_NATIVE_NOTIFICATIONS ?? "0",
        process.env.EXPO_PUBLIC_NATIVE_TELEPHONY ?? "0",
        process.env.EXPO_PUBLIC_CHAT_NATIVE ?? "0",
        process.env.EXPO_PUBLIC_MEETINGS_NATIVE ?? "0",
        process.env.EXPO_PUBLIC_NATIVE_FULL ?? "0",
        process.env.EXPO_PUBLIC_DISABLE_NATIVE_STUBS ?? "0"
      ].join(":")
  );
  const productionPlugins =
    api.env("production") ? [["transform-remove-console", { exclude: ["warn", "error"] }]] : [];

  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "module-resolver",
        {
          root: ["./src"],
          alias: {
            ...getBabelAliases(),
            shared: "./src/shared",
            store: "./src/store",
            core: "./src/core",
            features: "./src/features",
            hooks: "./src/hooks",
            components: "./src/components",
            helpers: "./src/helpers",
            api: "./src/api",
            layouts: "./src/layouts",
            navigations: "./src/navigations",
            router: "./src/router",
            types: "./src/types",
            views: "./src/views",
            assets: "./src/assets",
            "@api": "./src/api",
            "@assets": "./src/assets",
            "@components": "./src/components",
            "@composable": "./src/hooks",
            "@core": "./src/core",
            "@helpers": "./src/helpers",
            "@layouts": "./src/layouts",
            "@navigations": "./src/navigations",
            "@router": "./src/router",
            "@store": "./src/store",
            "@types": "./src/types",
            "@views": "./src/views"
          }
        }
      ],
      [
        "module:react-native-dotenv",
        {
          envName: "APP_ENV",
          moduleName: "@env",
          path: ".env",
          allowUndefined: true
        }
      ],
      "react-native-reanimated/plugin",
      ...productionPlugins
    ]
  };
};
