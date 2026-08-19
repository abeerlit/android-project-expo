const path = require("path");
const { withDangerousMod } = require("@expo/config-plugins");

function withMainApplicationPatch(config, options = {}) {
  const enabled =
    options.enableTelephony === true || options.enableNotifications === true;
  if (!enabled) return config;

  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const { mergeMainApplication } = require(
        path.join(cfg.modRequest.projectRoot, "scripts", "merge-main-application.js")
      );
      mergeMainApplication({
        telephony: options.enableTelephony === true,
        notifications:
          options.enableNotifications === true ||
          options.enableTelephony === true
      });
      return cfg;
    }
  ]);
}

module.exports = { withMainApplicationPatch };
