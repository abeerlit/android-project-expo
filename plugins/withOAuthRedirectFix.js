const { withAndroidManifest } = require("@expo/config-plugins");

const MAIN_ACTIVITY = ".MainActivity";
const VIEW_ACTION = "android.intent.action.VIEW";
const MAIN_ACTION = "android.intent.action.MAIN";

/**
 * OAuth must be handled only by AppAuth's RedirectUriReceiverActivity (merged via
 * appAuthRedirectScheme). Registering the same scheme on MainActivity causes two
 * "VOXO Connect" entries in the system picker; MainActivity does not complete login.
 */
function withOAuthRedirectFix(config, options = {}) {
  const oauthScheme =
    options.packageName ?? process.env.ANDROID_PACKAGE ?? "co.voxo.android";

  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (!app?.activity) return cfg;

    for (const activity of app.activity) {
      const name = activity.$?.["android:name"];
      if (name !== MAIN_ACTIVITY && name !== "MainActivity") continue;

      const filters = activity["intent-filter"];
      if (!Array.isArray(filters)) continue;

      activity["intent-filter"] = filters
        .map((filter) => stripOAuthSchemeFromFilter(filter, oauthScheme))
        .filter((filter) => filter != null);
    }

    return cfg;
  });
}

function stripOAuthSchemeFromFilter(filter, oauthScheme) {
  const actions = normalizeEntries(filter.action);
  const isLauncher = actions.some(
    (a) => a.$?.["android:name"] === MAIN_ACTION
  );
  if (isLauncher) return filter;

  const isView = actions.some((a) => a.$?.["android:name"] === VIEW_ACTION);
  if (!isView) return filter;

  const dataEntries = normalizeEntries(filter.data);
  if (dataEntries.length === 0) return filter;

  const kept = dataEntries.filter(
    (d) => d.$?.["android:scheme"] !== oauthScheme
  );

  if (kept.length === 0) return null;
  if (kept.length === dataEntries.length) return filter;

  return { ...filter, data: kept };
}

function normalizeEntries(entry) {
  if (!entry) return [];
  return Array.isArray(entry) ? entry : [entry];
}

module.exports = { withOAuthRedirectFix };
