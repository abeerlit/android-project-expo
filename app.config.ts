import type { ExpoConfig, ConfigContext } from "expo/config";
import path from "path";

const packageName = process.env.ANDROID_PACKAGE ?? "co.voxo.android";
const displayName = process.env.DISPLAY_NAME ?? "VOXO Connect";
/** Shared with ios-project-expo on expo.dev (same EAS project, both platforms). */
const easProjectSlug = "voxo-connect-ios-expo";
const defaultEasProjectId = "5461d0f9-2765-45dc-9f15-db4e1943c159";

function deriveOrganizationName(name: string): string {
  const trimmed = name.trim();
  const stripped = trimmed.replace(/\s+(Connect|Mobile|App)$/i, "").trim();
  return stripped || trimmed;
}

const organizationName =
  process.env.ORGANIZATION_NAME?.trim() ||
  deriveOrganizationName(displayName);
const legalTermsUrl =
  process.env.LEGAL_TERMS_URL?.trim() ||
  "https://voxo.co/terms-and-conditions";
const legalPrivacyUrl =
  process.env.LEGAL_PRIVACY_URL?.trim() || "https://voxo.co/privacy-policy";

const projectRoot = __dirname;
const defaultIcon = "./branding/voxo/icon.png";
const defaultSplash = "./branding/voxo/splash.png";
const iconPath = process.env.APP_ICON ?? defaultIcon;
const splashImage = process.env.SPLASH_IMAGE ?? defaultSplash;
const splashBackground =
  process.env.SPLASH_BACKGROUND_COLOR ?? "#ffffff";

export default ({ config }: ConfigContext): ExpoConfig => {
  const nativeTelephony =
    process.env.EXPO_PUBLIC_NATIVE_TELEPHONY === "1" ||
    process.env.EXPO_PUBLIC_NATIVE_TELEPHONY === "true";

  const nativeNotifications =
    process.env.EXPO_PUBLIC_NATIVE_NOTIFICATIONS === "1" ||
    process.env.EXPO_PUBLIC_NATIVE_NOTIFICATIONS === "true" ||
    nativeTelephony;

  const nativeMeetings =
    process.env.EXPO_PUBLIC_MEETINGS_NATIVE === "1" ||
    process.env.EXPO_PUBLIC_MEETINGS_NATIVE === "true" ||
    nativeTelephony;

  const configExtra = config.extra as { eas?: { projectId?: string } } | undefined;
  const existingEas = configExtra?.eas ?? {};
  const easProjectId =
    process.env.EAS_PROJECT_ID ??
    existingEas.projectId ??
    defaultEasProjectId;

  return {
    ...config,
    owner: process.env.EXPO_OWNER ?? config.owner ?? "voxo",
    name: displayName,
    slug: easProjectSlug,
    version: "2.0.49",
    orientation: "default",
    icon: iconPath,
    scheme: packageName,
    userInterfaceStyle: "light",
    newArchEnabled: false,
    splash: {
      image: splashImage,
      resizeMode: "contain",
      backgroundColor: splashBackground
    },
    android: {
      package: packageName,
      versionCode: 137,
      adaptiveIcon: {
        foregroundImage: iconPath,
        backgroundColor: splashBackground
      },
      googleServicesFile:
        process.env.GOOGLE_SERVICES_JSON ?? "./native-resources/google-services.json"
    },
    plugins: [
      "expo-dev-client",
      [
        "expo-image-picker",
        {
          photosPermission: `Allow ${displayName} to access your photos to attach images and videos in chat.`,
          cameraPermission: `Allow ${displayName} to use the camera to take photos for chat.`
        }
      ],
      [
        "expo-splash-screen",
        {
          image: splashImage,
          resizeMode: "contain",
          backgroundColor: splashBackground,
          imageWidth: 200
        }
      ],
      "@giphy/react-native-sdk",
      [
        "react-native-permissions",
        {
          androidPermissions: [
            "android.permission.CAMERA",
            "android.permission.RECORD_AUDIO",
            "android.permission.READ_CONTACTS",
            "android.permission.WRITE_CONTACTS",
            "android.permission.CALL_PHONE",
            "android.permission.POST_NOTIFICATIONS",
            "android.permission.ACCESS_FINE_LOCATION",
            "android.permission.READ_MEDIA_IMAGES",
            "android.permission.READ_MEDIA_VIDEO",
            "android.permission.READ_MEDIA_AUDIO"
          ]
        }
      ],
      [
        "expo-build-properties",
        {
          android: {
            minSdkVersion: 24,
            compileSdkVersion: 36,
            targetSdkVersion: 36,
            kotlinVersion: "2.0.21",
            ndkVersion: "28.0.13004108"
          }
        }
      ],
      [
        "./plugins/withVoxoAndroid.js",
        {
          googleServicesJson: process.env.GOOGLE_SERVICES_JSON,
          packageName,
          displayName,
          organizationName,
          enableTelephony: nativeTelephony,
          enableNotifications: nativeNotifications,
          enableMeetings: nativeMeetings,
          enableNativeCopy: nativeTelephony || nativeNotifications
        }
      ]
    ],
    extra: {
      eas: {
        ...existingEas,
        ...(easProjectId ? { projectId: easProjectId } : {})
      },
      EXPO_PUBLIC_NATIVE_TELEPHONY: nativeTelephony,
      EXPO_PUBLIC_NATIVE_NOTIFICATIONS: nativeNotifications,
      EXPO_PUBLIC_CHAT_NATIVE:
        process.env.EXPO_PUBLIC_CHAT_NATIVE === "1" ||
        process.env.EXPO_PUBLIC_CHAT_NATIVE === "true",
      EXPO_PUBLIC_MEETINGS_NATIVE:
        process.env.EXPO_PUBLIC_MEETINGS_NATIVE === "1" ||
        process.env.EXPO_PUBLIC_MEETINGS_NATIVE === "true",
      API_URL: process.env.API_URL,
      SENTRY_DSN: process.env.SENTRY_DSN,
      EXPO_PUBLIC_MINIMAL_BOOT:
        process.env.EXPO_PUBLIC_MINIMAL_BOOT === "1" ||
        process.env.EXPO_PUBLIC_MINIMAL_BOOT === "true",
      DISPLAY_NAME: displayName,
      ORGANIZATION_NAME: organizationName,
      LEGAL_TERMS_URL: legalTermsUrl,
      LEGAL_PRIVACY_URL: legalPrivacyUrl,
      ANDROID_PACKAGE: packageName,
      APP_ICON: path.resolve(projectRoot, iconPath),
      SPLASH_IMAGE: path.resolve(projectRoot, splashImage)
    },
    experiments: {
      tsconfigPaths: true
    }
  };
};
