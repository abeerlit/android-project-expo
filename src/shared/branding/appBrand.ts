import Constants from "expo-constants";

const DEFAULT_DISPLAY_NAME = "VOXO Connect";
const DEFAULT_ORGANIZATION_NAME = "VOXO";
const DEFAULT_ANDROID_PACKAGE = "co.voxo.android";
const DEFAULT_TERMS_URL = "https://voxo.co/terms-and-conditions";
const DEFAULT_PRIVACY_URL = "https://voxo.co/privacy-policy";

type BrandExtra = {
  DISPLAY_NAME?: string;
  ORGANIZATION_NAME?: string;
  LEGAL_TERMS_URL?: string;
  LEGAL_PRIVACY_URL?: string;
  ANDROID_PACKAGE?: string;
};

function extra(): BrandExtra {
  return (Constants.expoConfig?.extra ?? {}) as BrandExtra;
}

/** Strips common product suffixes for permission / legal copy ("VOXO Connect" → "VOXO"). */
export function deriveOrganizationName(displayName: string): string {
  const trimmed = displayName.trim();
  const stripped = trimmed.replace(/\s+(Connect|Mobile|App)$/i, "").trim();
  return stripped || trimmed;
}

/** Tenant app name (launcher / notifications). From `DISPLAY_NAME` at EAS build time. */
export function getAppDisplayName(): string {
  const fromExtra = extra().DISPLAY_NAME?.trim();
  if (fromExtra) return fromExtra;
  const fromConfig = Constants.expoConfig?.name?.trim();
  if (fromConfig) return fromConfig;
  return DEFAULT_DISPLAY_NAME;
}

/** Organization label for in-app copy ("saved to X servers"). */
export function getOrganizationName(): string {
  const fromExtra = extra().ORGANIZATION_NAME?.trim();
  if (fromExtra) return fromExtra;
  return deriveOrganizationName(getAppDisplayName());
}

/** Play Store application id / OAuth redirect scheme. */
export function getAndroidPackage(): string {
  const fromExtra = extra().ANDROID_PACKAGE?.trim();
  if (fromExtra) return fromExtra;
  const fromConfig = Constants.expoConfig?.android?.package?.trim();
  if (fromConfig) return fromConfig;
  return DEFAULT_ANDROID_PACKAGE;
}

export function getMicrosoftOAuthRedirectUrl(): string {
  const pkg = getAndroidPackage();
  return `${pkg}://${pkg}/android/callback`;
}

export function getAppNotificationsChannelName(): string {
  return `${getAppDisplayName()} Notifications`;
}

export function getAppLoggerName(): string {
  return `${getAppDisplayName()} Mobile`;
}

export function getLegalTermsUrl(): string {
  return extra().LEGAL_TERMS_URL?.trim() || DEFAULT_TERMS_URL;
}

export function getLegalPrivacyUrl(): string {
  return extra().LEGAL_PRIVACY_URL?.trim() || DEFAULT_PRIVACY_URL;
}

/** Boot / error screens: "{App} could not start" */
export function appCouldNotStartMessage(): string {
  return `${getAppDisplayName()} could not start`;
}

export function appStartingMessage(): string {
  return `Starting ${getAppDisplayName()}…`;
}

export function appShellErrorMessage(): string {
  return `${getAppDisplayName()} shell error`;
}

export function appFailedToStartMessage(): string {
  return `${getAppDisplayName()} failed to start`;
}

export function contactsConsentMessage(): string {
  const app = getAppDisplayName();
  const org = getOrganizationName();
  return `${app} can access your phone contacts so you can call and message them. If you create a personal contact in the app, that contact's details will be saved to ${org} servers.`;
}
