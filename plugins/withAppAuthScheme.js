const { withAppBuildGradle } = require("@expo/config-plugins");

function withAppAuthScheme(config, options = {}) {
  const scheme = options.packageName ?? "co.voxo.android";

  return withAppBuildGradle(config, (mod) => {
    let contents = mod.modResults.contents;
    if (!contents.includes("appAuthRedirectScheme")) {
      contents = contents.replace(
        /defaultConfig\s*\{/,
        `defaultConfig {
        manifestPlaceholders = [appAuthRedirectScheme: "${scheme}"]`
      );
    }
    mod.modResults.contents = contents;
    return mod;
  });
}

module.exports = { withAppAuthScheme };
