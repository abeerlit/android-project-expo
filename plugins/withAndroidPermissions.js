/** Manifest permissions from bare Android — used by withVoxoAndroid orchestrator. */
const { withAndroidManifestExtras } = require("./withAndroidManifestExtras.js");

function withAndroidPermissions(config, options = {}) {
  return withAndroidManifestExtras(config, options);
}

module.exports = { withAndroidPermissions };
