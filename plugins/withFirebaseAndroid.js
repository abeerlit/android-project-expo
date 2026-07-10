const fs = require("fs");
const path = require("path");
const {
  withDangerousMod,
  withProjectBuildGradle,
  withAppBuildGradle
} = require("@expo/config-plugins");

function withGoogleServicesGradle(config) {
  config = withProjectBuildGradle(config, (mod) => {
    let contents = mod.modResults.contents;
    if (!contents.includes("com.google.gms:google-services")) {
      contents = contents.replace(
        /dependencies\s*\{/,
        `dependencies {\n        classpath('com.google.gms:google-services:4.4.2')`
      );
    }
    mod.modResults.contents = contents;
    return mod;
  });

  config = withAppBuildGradle(config, (mod) => {
    let contents = mod.modResults.contents;
    if (!contents.includes("com.google.gms.google-services")) {
      contents += "\napply plugin: 'com.google.gms.google-services'\n";
    }
    mod.modResults.contents = contents;
    return mod;
  });

  return config;
}

function withFirebaseAndroid(config, options = {}) {
  const rel =
    options.googleServicesJson ?? "./native-resources/google-services.json";
  const projectRoot = config._internal?.projectRoot ?? process.cwd();
  const src = path.resolve(projectRoot, rel);

  config = withDangerousMod(config, [
    "android",
    async (cfg) => {
      const androidRoot = path.join(cfg.modRequest.platformProjectRoot, "app");
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(androidRoot, "google-services.json"));
        console.log("[withFirebaseAndroid] google-services.json copied");
      }
      return cfg;
    }
  ]);

  return withGoogleServicesGradle(config);
}

module.exports = { withFirebaseAndroid };
