import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";
import { Platform } from "react-native";

type SentryExtra = {
  SENTRY_DSN?: string;
  EXPO_PUBLIC_SENTRY_DSN?: string;
  SENTRY_ORG?: string;
  SENTRY_PROJECT?: string;
  APP_ENV?: string;
};

function resolveDsn(extra: SentryExtra): string {
  const candidates = [
    extra.SENTRY_DSN,
    extra.EXPO_PUBLIC_SENTRY_DSN,
    process.env.EXPO_PUBLIC_SENTRY_DSN,
    process.env.SENTRY_DSN
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function resolveEnvironment(extra: SentryExtra): string {
  if (__DEV__) return "development";
  const fromConfig =
    typeof extra.APP_ENV === "string" ? extra.APP_ENV.trim() : "";
  if (fromConfig) return fromConfig;
  return "production";
}

/**
 * JS-only Sentry bootstrap — enabled for both development and production.
 * Native autolinking stays off (see react-native.config.js), so all native
 * probes must be disabled to avoid "Native is disabled" Metro spam.
 */
export function setupSentry(): void {
  const extra = (Constants.expoConfig?.extra ?? {}) as SentryExtra;
  const dsn = resolveDsn(extra);

  if (!dsn) {
    console.warn(
      "[sentry] No DSN — set SENTRY_DSN in .env (local) or EAS env (builds)"
    );
    return;
  }

  const environment = resolveEnvironment(extra);
  const release =
    Constants.expoConfig?.version != null
      ? `${Constants.expoConfig.slug ?? "voxo-connect-android"}@${Constants.expoConfig.version}`
      : undefined;

  Sentry.init({
    dsn,
    enabled: true,
    enableNative: false,
    autoInitializeNativeSdk: false,
    enableNativeNagger: false,
    enableNativeCrashHandling: false,
    enableNativeFramesTracking: false,
    enableAppStartTracking: false,
    enableAppHangTracking: false,
    enableWatchdogTerminationTracking: false,
    enableNdk: false,
    // Keep Metro clean — Sentry debug logs look like app errors.
    debug: false,
    environment,
    release,
    // Capture 100% of JS errors in every environment.
    sampleRate: 1.0,
    tracesSampleRate: environment === "production" ? 0.2 : 1.0,
    sendDefaultPii: false,
    enableAutoSessionTracking: true,
    attachStacktrace: true,
    beforeSend(event) {
      // Drop noise from intentional JS-only mode / plain-object rejections.
      const values = event.exception?.values ?? [];
      for (const value of values) {
        const msg = `${value.type ?? ""} ${value.value ?? ""}`;
        if (
          msg.includes("Native is disabled") ||
          msg.includes("Could not fetch native sdk info")
        ) {
          return null;
        }
      }
      return event;
    }
  });

  Sentry.setTag("app_env", environment);
  Sentry.setTag("deploy", "android");
  Sentry.setTag("platform", "android");
  if (extra.SENTRY_ORG) Sentry.setTag("sentry_org", extra.SENTRY_ORG);
  if (extra.SENTRY_PROJECT) {
    Sentry.setTag("sentry_project", extra.SENTRY_PROJECT);
  }

  if (Platform.OS === "android") {
    const c = (Platform.constants ?? {}) as {
      Brand?: string;
      Manufacturer?: string;
      Model?: string;
      Release?: string;
    };
    if (c.Manufacturer) Sentry.setTag("device_manufacturer", c.Manufacturer);
    if (c.Brand) Sentry.setTag("device_brand", c.Brand);
    if (c.Model) Sentry.setTag("device_model", c.Model);
    if (c.Release) Sentry.setTag("android_release", c.Release);
    const isSamsung =
      String(c.Manufacturer ?? "").toLowerCase().includes("samsung") ||
      String(c.Brand ?? "").toLowerCase().includes("samsung");
    Sentry.setTag("is_samsung", isSamsung ? "true" : "false");
  }

  console.log(
    `[sentry] ready env=${environment} org=${extra.SENTRY_ORG || "(unset)"} project=${extra.SENTRY_PROJECT || "(unset)"} (js-only)`
  );

  // Sentry.captureMessage("sentry-smoke-test: app booted", "info");
}
