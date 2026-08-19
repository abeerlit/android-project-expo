/**
 * Expo Android shell only — CallKeep-aligned runtime permission gate.
 * @see android-project-expo (not bare android-project)
 */
import { PermissionsAndroid, Platform } from "react-native";
import { Logger } from "shared/utils/Logger.ts";

const logger = new Logger("AndroidCallPermissions: ");

type AndroidPermission = (typeof PermissionsAndroid.PERMISSIONS)[keyof typeof PermissionsAndroid.PERMISSIONS];

/** Match CallKeep: API 30+ uses READ_PHONE_NUMBERS, not READ_PHONE_STATE. */
function getCallRuntimePermissions(): AndroidPermission[] {
  const sdk =
    typeof Platform.Version === "number" ? Platform.Version : parseInt(String(Platform.Version), 10);

  const required: AndroidPermission[] = [
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    PermissionsAndroid.PERMISSIONS.CALL_PHONE
  ];

  if (sdk >= 30) {
    required.push(PermissionsAndroid.PERMISSIONS.READ_PHONE_NUMBERS);
  } else {
    required.push(PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE);
    if (sdk >= 26) {
      required.push(PermissionsAndroid.PERMISSIONS.READ_PHONE_NUMBERS);
    }
  }

  return required;
}

function permissionLabel(permission: string): string {
  if (permission.includes("RECORD_AUDIO")) return "Microphone";
  if (permission.includes("CALL_PHONE")) return "Phone (place calls)";
  if (permission.includes("READ_PHONE_NUMBERS")) return "Phone numbers";
  if (permission.includes("READ_PHONE_STATE")) return "Phone state";
  return permission;
}

export async function ensureAndroidCallPermissions(): Promise<{
  granted: boolean;
  missing: string[];
}> {
  if (Platform.OS !== "android") {
    return { granted: true, missing: [] };
  }

  const required = getCallRuntimePermissions();
  const missing: string[] = [];

  for (const permission of required) {
    try {
      if (!(await PermissionsAndroid.check(permission))) {
        missing.push(permission);
      }
    } catch (e) {
      logger.error("check failed:", permission, e);
      missing.push(permission);
    }
  }

  if (missing.length === 0) {
    return { granted: true, missing: [] };
  }

  const results = await PermissionsAndroid.requestMultiple(missing);
  const stillMissing = missing.filter(
    (p) => results[p] !== PermissionsAndroid.RESULTS.GRANTED
  );

  if (stillMissing.length) {
    logger.warn("Still missing:", stillMissing.map(permissionLabel));
  }

  return {
    granted: stillMissing.length === 0,
    missing: stillMissing.map(permissionLabel)
  };
}
