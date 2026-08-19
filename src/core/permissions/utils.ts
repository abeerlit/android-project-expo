// React Imports
import { Platform } from "react-native";
import {
  check,
  request,
  PERMISSIONS,
  RESULTS,
  Permission,
  requestNotifications,
  checkNotifications
} from "react-native-permissions";

// Utils & Types
import { Logger } from "shared/utils/Logger.ts";
import {
  PermissionResult,
  PermissionStatus,
  PermissionType
} from "core/permissions/types.ts";

/**
 * Expo Android overrides — notifications use checkNotifications/requestNotifications on Android.
 */

const logger = new Logger("Permissions: ");

const permissionMap: Record<
  PermissionType,
  { ios: Permission; android: Permission }
> = {
  microphone: {
    ios: PERMISSIONS.IOS.MICROPHONE,
    android: PERMISSIONS.ANDROID.RECORD_AUDIO
  },
  location: {
    ios: PERMISSIONS.IOS.LOCATION_WHEN_IN_USE,
    android: PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION
  },
  notifications: {
    ios: PERMISSIONS.IOS.LOCATION_WHEN_IN_USE,
    android:
      (PERMISSIONS.ANDROID as { POST_NOTIFICATIONS?: Permission }).POST_NOTIFICATIONS ||
      PERMISSIONS.ANDROID.READ_CONTACTS
  },
  contacts: {
    ios: PERMISSIONS.IOS.CONTACTS,
    android: PERMISSIONS.ANDROID.READ_CONTACTS
  },
  phone: {
    ios: PERMISSIONS.IOS.MICROPHONE,
    android: PERMISSIONS.ANDROID.READ_PHONE_STATE
  },
  phoneNumbers: {
    ios: PERMISSIONS.IOS.MICROPHONE,
    android: PERMISSIONS.ANDROID.READ_PHONE_NUMBERS
  }
};

const mapStatus = (result: string): PermissionResult => {
  let status = "not-determined";
  let granted = false;

  switch (result) {
    case RESULTS.GRANTED:
      status = "granted";
      granted = true;
      break;
    case RESULTS.DENIED:
      status = "denied";
      granted = false;
      break;
    case RESULTS.BLOCKED:
      status = "blocked";
      granted = false;
      break;
    case RESULTS.UNAVAILABLE:
      status = "unavailable";
      granted = false;
      break;
    case RESULTS.LIMITED:
      status = "limited";
      granted = true;
      break;
  }

  return { status, granted } as PermissionResult;
};

export const getPermission = (type: PermissionType): Permission | null => {
  const platform = Platform.OS === "ios" ? "ios" : "android";
  const permission = permissionMap[type]?.[platform];

  if (!permission) {
    logger.error(
      `Permission not found for type: ${type} on platform: ${platform}`
    );
    return null;
  }

  return permission;
};

const requestIOSNotifications = async (): Promise<PermissionResult> => {
  if (Platform.OS !== "ios") {
    return { status: "unavailable", granted: false };
  }

  try {
    const result = await requestNotifications(["alert", "badge", "sound"]);

    return {
      status: result.status.toLowerCase() as PermissionStatus,
      granted: result.status === RESULTS.GRANTED
    };
  } catch (error) {
    logger.error("Error requesting iOS notifications permission:", error);
    return { status: "unavailable", granted: false };
  }
};

const checkIOSNotifications = async (): Promise<PermissionResult> => {
  if (Platform.OS !== "ios") {
    return { status: "unavailable", granted: false };
  }

  try {
    const result = await checkNotifications();

    return {
      status: result.status.toLowerCase() as PermissionStatus,
      granted: result.status === RESULTS.GRANTED
    };
  } catch (error) {
    logger.error("Error checking iOS notifications permission:", error);
    return { status: "unavailable", granted: false };
  }
};

const requestAndroidNotifications = async (): Promise<PermissionResult> => {
  if (Platform.OS !== "android") {
    return { status: "unavailable", granted: false };
  }

  try {
    const result = await requestNotifications();

    return {
      status: result.status.toLowerCase() as PermissionStatus,
      granted: result.status === RESULTS.GRANTED
    };
  } catch (error) {
    logger.error("Error requesting Android notifications permission:", error);
    return { status: "unavailable", granted: false };
  }
};

const checkAndroidNotifications = async (): Promise<PermissionResult> => {
  if (Platform.OS !== "android") {
    return { status: "unavailable", granted: false };
  }

  try {
    const result = await checkNotifications();

    return {
      status: result.status.toLowerCase() as PermissionStatus,
      granted: result.status === RESULTS.GRANTED
    };
  } catch (error) {
    logger.error("Error checking Android notifications permission:", error);
    return { status: "unavailable", granted: false };
  }
};

export const checkPermission = async (
  type: PermissionType
): Promise<PermissionResult> => {
  try {
    if (type === "notifications") {
      if (Platform.OS === "ios") return await checkIOSNotifications();
      if (Platform.OS === "android") return await checkAndroidNotifications();
    }

    const permission = getPermission(type);
    if (!permission) {
      logger.error(
        `Cannot check permission - permission is null for type: ${type}`
      );
      return { status: "unavailable", granted: false };
    }

    const result = await check(permission);
    return mapStatus(result);
  } catch (error) {
    logger.error(`Error checking permission ${type}:`, error);
    return { status: "unavailable", granted: false };
  }
};

export const requestPermission = async (
  type: PermissionType
): Promise<PermissionResult> => {
  try {
    if (type === "notifications") {
      if (Platform.OS === "ios") return await requestIOSNotifications();
      if (Platform.OS === "android") return await requestAndroidNotifications();
    }

    const permission = getPermission(type);
    if (!permission) {
      logger.error(
        `Cannot request permission - permission is null for type: ${type}`
      );
      return { status: "unavailable", granted: false };
    }

    const result = await request(permission);
    return mapStatus(result);
  } catch (error) {
    logger.error(`Error requesting permission ${type}:`, error);
    return { status: "unavailable", granted: false };
  }
};

export const ensurePermission = async (
  type: PermissionType
): Promise<PermissionResult> => {
  const status = await checkPermission(type);

  if (status.granted) {
    return status;
  }

  return requestPermission(type);
};
