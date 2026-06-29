import { Platform } from "react-native";
import messaging from "@react-native-firebase/messaging";
import { Logger } from "shared/utils/Logger.ts";
import * as userActions from "store/users/actions.ts";
import { logAndroidVoipPushToken } from "./androidVoipPushTokenLog.ts";

const logger = new Logger("RegisterPushOnLaunch: ");

export type RegisterPushTokenParams = {
  isLoggedIn: boolean;
  accessToken: string | null | undefined;
  userId: number | undefined;
  hasNotificationPermission: boolean;
  isSendbirdConnected: boolean;
  setPushNotification: (
    enabled: boolean,
    tokenType: "ios" | "android",
    token: string
  ) => Promise<void>;
  dispatch: (action: { type: string; payload: unknown }) => void;
};

let didRegisterThisProcessLaunch = false;
let registrationInFlight = false;

/** Reset on logout so the next login can register again in the same process. */
export function resetPushRegistrationForProcess(): void {
  didRegisterThisProcessLaunch = false;
  registrationInFlight = false;
}

export function hasRegisteredPushThisProcessLaunch(): boolean {
  return didRegisterThisProcessLaunch;
}

/**
 * Register FCM/APNS with Sendbird and backend once per cold app launch.
 * Does not skip when the token string is unchanged (server refresh every open).
 */
export async function registerPushTokenForAppLaunch(
  params: RegisterPushTokenParams
): Promise<boolean> {
  if (didRegisterThisProcessLaunch) {
    return true;
  }

  if (registrationInFlight) {
    return false;
  }

  const {
    isLoggedIn,
    accessToken,
    userId,
    hasNotificationPermission,
    isSendbirdConnected,
    setPushNotification,
    dispatch
  } = params;

  if (!isLoggedIn || !accessToken?.trim() || !userId) {
    logger.debug("Not logged in — skipping push registration");
    return false;
  }

  if (!hasNotificationPermission) {
    logger.debug("No notification permission — skipping push registration");
    return false;
  }

  if (!isSendbirdConnected) {
    logger.debug("Sendbird not connected — skipping push registration");
    return false;
  }

  registrationInFlight = true;

  try {
    const tokenType: "ios" | "android" =
      Platform.OS === "ios" ? "ios" : "android";
    const notificationTokenType: "ios_remote_notifications" | "android_fcm" =
      Platform.OS === "ios" ? "ios_remote_notifications" : "android_fcm";

    let latestToken: string | null = null;

    if (Platform.OS === "ios") {
      latestToken = await messaging().getAPNSToken();
    } else {
      try {
        latestToken = await messaging().getToken();
      } catch (error: unknown) {
        const err = error as { code?: string; message?: string };
        const errorCode = err?.code || err?.message || "";
        const isServiceUnavailable =
          errorCode.includes("SERVICE_NOT_AVAILABLE") ||
          errorCode.includes("messaging/unknown") ||
          err?.message?.includes("SERVICE_NOT_AVAILABLE");

        if (isServiceUnavailable) {
          logger.warn(
            "Android: Firebase service not available for getToken",
            { errorCode, errorMessage: err?.message }
          );
          return false;
        }
        throw error;
      }
    }

    if (!latestToken) {
      logger.debug("No push token from Firebase");
      return false;
    }

    logAndroidVoipPushToken("app_launch_register", latestToken, {
      tokenType: notificationTokenType,
      userId,
      destinations: ["sendbird_fcm", "backend_voip_android_fcm"]
    });

    logger.debug("Registering push token for app launch (Sendbird + backend)", {
      tokenType: notificationTokenType,
      tokenLength: latestToken.length
    });

    await setPushNotification(true, tokenType, latestToken);

    dispatch({
      type: userActions.STORE_PUSH_ID,
      payload: {
        pushToken: latestToken,
        tokenType: notificationTokenType
      }
    });

    didRegisterThisProcessLaunch = true;
    logger.debug("Push token registered for app launch successfully");
    return true;
  } catch (error) {
    logger.error("Push registration for app launch failed:", error);
    return false;
  } finally {
    registrationInFlight = false;
  }
}

/**
 * Register when FCM rotates the token (same session).
 */
export async function registerPushTokenOnRefresh(
  params: RegisterPushTokenParams & { refreshedToken: string }
): Promise<boolean> {
  const {
    refreshedToken,
    isLoggedIn,
    accessToken,
    userId,
    hasNotificationPermission,
    isSendbirdConnected,
    setPushNotification,
    dispatch
  } = params;

  if (!isLoggedIn || !accessToken?.trim() || !userId || !hasNotificationPermission) {
    return false;
  }

  if (!isSendbirdConnected) {
    return false;
  }

  if (registrationInFlight) {
    return false;
  }

  registrationInFlight = true;

  try {
    const tokenType: "ios" | "android" =
      Platform.OS === "ios" ? "ios" : "android";
    const notificationTokenType: "ios_remote_notifications" | "android_fcm" =
      Platform.OS === "ios" ? "ios_remote_notifications" : "android_fcm";

    logAndroidVoipPushToken("fcm_token_refresh_register", refreshedToken, {
      tokenType: notificationTokenType,
      userId,
      destinations: ["sendbird_fcm", "backend_voip_android_fcm"]
    });

    await setPushNotification(true, tokenType, refreshedToken);

    dispatch({
      type: userActions.STORE_PUSH_ID,
      payload: {
        pushToken: refreshedToken,
        tokenType: notificationTokenType
      }
    });

    logger.debug("Refreshed FCM token registered with Sendbird and backend");
    return true;
  } catch (error) {
    logger.error("Refreshed token registration failed:", error);
    return false;
  } finally {
    registrationInFlight = false;
  }
}
