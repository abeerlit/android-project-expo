/**
 * Redux saga class init
 * There can be multiple sagas
 * Export them as an array
 * Top level sagas in store will take care of combining sagas
 */
import { Platform } from "react-native";
import { takeEvery, call, put, select, delay } from "redux-saga/effects";
import * as authActions from "./actions";
import * as directoryActions from "store/directory/actions.ts";
import * as userActions from "store/users/actions.ts";
import * as textActions from "store/text/actions.ts";
import { Logger } from "shared/utils/Logger.ts";
import { LoginResponse } from "shared/api/authentication/types.ts";
import {
  getFaxSettings,
  getVoicemailSettings
} from "shared/api/user-settings/methods.ts";
import {
  FaxSettings,
  User,
  VoicemailSettings
} from "shared/api/users/types.ts";
/** Lazy import breaks store ↔ NotificationManager ↔ global-sagas require cycle on Expo. */
function getNotificationManager() {
  return require("core/notifications/NotificationManager.ts").default;
}
import {
  deletePushToken,
  patchChatNotifications
} from "shared/api/users/methods.ts";

const logger = new Logger("Login Sagas: ");

interface LoginSuccessAction {
  type: typeof authActions.LOGIN_SUCCESS;
  payload: LoginResponse;
}

const emptyVoicemailSettings = (user: User): VoicemailSettings => ({
  id: user.voicemailId ?? 0,
  attach: null,
  email: user.email ?? "",
  greetings: [],
  password: ""
});

// Our worker Saga that log the user in
function* login(action: LoginSuccessAction) {
  try {
    const user = action.payload.user;
    logger.debug("login() saga: handling user login");

    // Fax / voicemail are best-effort (match web user-store: missing settings must not block login).
    let faxSettingsResult: FaxSettings | false = false;
    let faxNumber = user.faxNumber ?? "";
    try {
      const fax = (yield call(
        getFaxSettings,
        action.payload.accessToken
      )) as FaxSettings;
      faxSettingsResult = { ...fax };
      faxNumber = fax.faxNumber ?? faxNumber;
    } catch (faxError: unknown) {
      logger.warn(
        "login() saga: getFaxSettings failed (non-fatal), continuing without fax settings",
        faxError
      );
    }

    let voicemailSettings: VoicemailSettings;
    try {
      voicemailSettings = (yield call(
        getVoicemailSettings,
        action.payload.accessToken
      )) as VoicemailSettings;
    } catch (vmError: unknown) {
      logger.warn(
        "login() saga: getVoicemailSettings failed (non-fatal), using defaults",
        vmError
      );
      voicemailSettings = emptyVoicemailSettings(user);
    }

    const finalUser: User = {
      ...user,
      voicemailId: voicemailSettings.id,
      voicemailSettings,
      faxNumber,
      faxSettings: faxSettingsResult ? { ...faxSettingsResult } : false,
      // 🔧 OVERRIDE: Force specific notification settings
      enableChatNotifications: 1,
      enableAllNewMessageNotifications: 1,
      enableDirectMessageNotifications: 0
    };

    console.log("finalUser", finalUser);

    // 🔍 LOG: Check notification settings before provisioning to Redux
    console.log("🔍 [SAGA] Final User - Notification Settings (OVERRIDDEN):", {
      enableChatNotifications: finalUser.enableChatNotifications,
      enableAllNewMessageNotifications:
        finalUser.enableAllNewMessageNotifications,
      enableDirectMessageNotifications:
        finalUser.enableDirectMessageNotifications,
      enableMobileCallNotifications: finalUser.enableMobileCallNotifications,
      enableMobileTextNotifications: finalUser.enableMobileTextNotifications
    });

    yield put({ type: userActions.PROVISION_USER, payload: finalUser });
    yield put({ type: userActions.REFRESH_PUSH_ID });
    yield put({ type: directoryActions.FETCH_DIRECTORY });

    // 🔧 SYNC: Update backend with hardcoded notification settings
    try {
      yield call(
        patchChatNotifications,
        {
          enableChatNotifications: 1,
          enableAllNewMessageNotifications: 1,
          enableDirectMessageNotifications: 0
        },
        action.payload.accessToken
      );
      logger.debug("✅ [SAGA] Notification settings synced to backend");
    } catch (error) {
      logger.error(
        "❌ [SAGA] Failed to sync notification settings to backend:",
        error
      );
      // Don't fail login if this errors
    }
  } catch (error) {
    logger.error("login() saga error", error);
  }
}

interface LogoutAction {
  type: typeof authActions.LOG_OUT;
  payload?: { accessToken?: string };
}

function* logout(action?: LogoutAction) {
  logger.debug("logout() saga: handling user logout");

  try {
    // LOG_OUT reducer clears auth before this saga runs — use payload.accessToken
    // (SecurityPage passes it). Fallback select is for any other logout entry point.
    const state = yield select();
    const accessToken =
      action?.payload?.accessToken || state.authReducer?.accessToken;

    // ✅ CRITICAL: Immediately stop notification processing
    // This prevents any notifications from being processed during logout
    const notificationManager = getNotificationManager();
    notificationManager.destroy();
    logger.debug("✅ [logout] NotificationManager destroyed");

    // Clear badge count
    yield call([notificationManager, notificationManager.setBadgeCount], 0);

    // Let SendbirdContextProvider finish unregister + disconnect (runs when isLoggedIn
    // became false on LOG_OUT) before deleting the device token on our backend.
    logger.debug(
      "⏳ [logout] Waiting for Sendbird push unregister + disconnect before backend delete"
    );
    yield delay(500);

    logger.debug("🔍 [logout] Attempting to delete push token from backend", {
      hasAccessToken: !!accessToken,
      accessTokenLength: accessToken?.length || 0,
      platform: Platform.OS
    });

    if (accessToken) {
      try {
        const result = yield call(deletePushToken, accessToken);
        logger.debug("✅ [logout] Push token deleted from backend", {
          result: result,
          platform: Platform.OS
        });
      } catch (error: any) {
        logger.error("❌ [logout] Error deleting push token from backend:", {
          error: error,
          errorMessage: error?.message,
          errorCode: error?.code,
          errorResponse: error?.response,
          platform: Platform.OS
        });
        // Don't fail logout if this errors - continue with cleanup
      }
    } else {
      logger.warn(
        "⚠️ [logout] No access token available to delete push token",
        {
          platform: Platform.OS
        }
      );
    }

    if (Platform.OS === "ios") {
      try {
        yield put({ type: userActions.DELETE_PUSH_ID });
        logger.debug(
          "logout() saga: Dispatched DELETE_PUSH_ID to remove push token from server"
        );
      } catch (error) {
        logger.error("logout() saga: Error deleting push token", error);
        // Continue with logout even if push token deletion fails
      }
    }

    // Reset Home local token state after backend + Sendbird cleanup
    yield put({ type: userActions.RESET_TOKEN_REGISTRATION });

    yield put({ type: userActions.CLEAR_USER });
    yield put({ type: directoryActions.PURGE_DIRECTORY });
    yield put({ type: textActions.RESET_TEXT_STATE });

    logger.debug("✅ [logout] Logout cleanup completed");
  } catch (error) {
    logger.error("❌ [logout] Error during logout cleanup:", error);
    // Still clear user and directory even if cleanup fails
    yield put({ type: userActions.CLEAR_USER });
    yield put({ type: directoryActions.PURGE_DIRECTORY });
    yield put({ type: textActions.RESET_TEXT_STATE });
  }
}

export const authSagas = [
  takeEvery(authActions.LOGIN_SUCCESS, login),
  takeEvery(authActions.LOG_OUT, logout)
];
