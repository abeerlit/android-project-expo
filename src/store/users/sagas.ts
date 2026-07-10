// Our worker Saga that log the user in
import { Platform } from "react-native";
import { call, put, select, takeEvery } from "redux-saga/effects";
import * as userActions from "store/users/actions.ts";
import * as globalActions from "store/global-actions.ts";
import * as directoryActions from "store/directory/actions.ts";
import { Logger } from "shared/utils/Logger.ts";
import { State } from "store/types.ts";
import * as authActions from "store/authentication/actions.ts";
import type { CompanyContact } from "shared/api/directory/types.ts";
import {
  deletePushToken,
  setPushToken,
  getCurrentUserProfile
} from "shared/api/users/methods.ts";
import { jwtAuthenticate } from "shared/api/authentication/methods.ts";
import { normalizeUserDnd } from "shared/utils/user-dnd.ts";
import { hasActiveCall } from "../../core/callState";
import { logAndroidVoipPushToken } from "core/notifications/androidVoipPushTokenLog.ts";

const logger = new Logger("User Sagas: ");

const getToken = (state: State) => state.authReducer.accessToken;

interface StorePushAction {
  type: string;
  payload: {
    pushToken: string;
    tokenType: string;
  };
}

function* storePushId(action: StorePushAction): Generator<any, void, any> {
  try {
    const authReducer = yield select((state: State) => state.authReducer);
    if (
      authReducer.isLoggedIn &&
      action.payload.pushToken &&
      action.payload.pushToken.length > 0
    ) {
      logger.debug("🔑 [User Sagas] SMS/Backend: storing push token for SMS notifications", {
        tokenType: action.payload.tokenType,
        token: action.payload.pushToken,
        tokenLength: action.payload.pushToken.length
      });
      if (
        Platform.OS === "android" &&
        action.payload.tokenType === "android_fcm"
      ) {
        logAndroidVoipPushToken("backend_pushtoken_saga", action.payload.pushToken, {
          tokenType: action.payload.tokenType,
          api: "POST /v2/push/pushtoken"
        });
      }
      yield call(setPushToken, {
        tokenType: action.payload.tokenType,
        token: action.payload.pushToken,
        accessToken: authReducer.accessToken
      });
      logger.debug("🔑 [User Sagas] SMS/Backend: push token sent to backend successfully");
    }
  } catch (_e) {
    // logger.debug("Error storing push id", e);
  }
}

function* deletePushId(): Generator<any, void, any> {
  logger.debug("deletePushId() saga: deleting user push token");
  try {
    const authReducer = yield select((state: State) => state.authReducer);
    const accessToken = authReducer?.accessToken;

    if (accessToken) {
      yield call(deletePushToken, accessToken);
    } else {
      logger.warn(
        "deletePushId() called without accessToken - skipping API call"
      );
    }
  } catch (error) {
    logger.error("deletePushId() error:", error);
  }
}

function* refreshUserProfile(): Generator<any, void, any> {
  try {
    if (typeof hasActiveCall === "function" && hasActiveCall()) {
      logger.debug("Skipping refreshUserProfile - active/connecting call");
      return;
    }
    const token: string = yield select(getToken);
    if (!token) return;
    const user = (yield select((s: State) => s.userReducer?.user)) as {
      avatarPath?: string;
      coverPhoto?: string;
      dnd?: string;
    } | null;
    const profile = (yield call(
      getCurrentUserProfile,
      token
    )) as Awaited<ReturnType<typeof getCurrentUserProfile>>;

    let dnd: "0" | "1" | undefined = profile?.dnd;
    if (dnd === undefined) {
      try {
        const auth = (yield call(
          jwtAuthenticate,
          token
        )) as Awaited<ReturnType<typeof jwtAuthenticate>>;
        if (auth?.user && auth.user.dnd !== undefined && auth.user.dnd !== null) {
          dnd = normalizeUserDnd(auth.user.dnd);
        }
      } catch (e) {
        logger.debug("refreshUserProfile jwtAuthenticate fallback:", e);
      }
    }

    if (!profile && dnd === undefined) return;

    const updates: Record<string, unknown> = {};
    if (profile) {
      if (profile.avatarPath != null && profile.avatarPath !== user?.avatarPath) {
        updates.avatarPath = profile.avatarPath;
      }
      if (profile.coverPhoto != null && profile.coverPhoto !== user?.coverPhoto) {
        updates.coverPhoto = profile.coverPhoto;
      }
    }
    if (dnd !== undefined) {
      const current = normalizeUserDnd(user?.dnd);
      if (dnd !== current) {
        updates.dnd = dnd;
      }
    }
    if (Object.keys(updates).length === 0) return;
    if (updates.avatarPath != null || updates.coverPhoto != null) {
      updates.profileMediaVersion = Date.now();
    }
    yield put({ type: userActions.UPDATE_USER, payload: updates });
    logger.debug("refreshUserProfile: updated from server", {
      keys: Object.keys(updates)
    });
  } catch (e) {
    logger.debug("refreshUserProfile error:", e);
  }
}

function* syncUserProfileFromDirectory(action: {
  type: string;
  payload: CompanyContact[];
}): Generator<any, void, any> {
  try {
    const user = (yield select((s: State) => s.userReducer?.user)) as {
      id?: number;
      extId?: number;
      avatarPath?: string;
      coverPhoto?: string;
    } | null;
    if (!user?.id) return;
    const contacts = action?.payload;
    if (!Array.isArray(contacts)) return;
    const self = contacts.find(
      (c) => c.userId === user.id || c.extId === user.extId
    );
    if (!self) return;
    const updates: Record<string, unknown> = {};
    if (self.avatarPath != null && self.avatarPath !== user.avatarPath) {
      updates.avatarPath = self.avatarPath;
    }
    if (self.coverPhoto != null && self.coverPhoto !== user.coverPhoto) {
      updates.coverPhoto = self.coverPhoto;
    }
    if (Object.keys(updates).length > 0) {
      updates.profileMediaVersion = Date.now();
      yield put({ type: userActions.UPDATE_USER, payload: updates });
      logger.debug(
        "syncUserProfileFromDirectory: updated avatar/cover from company contacts"
      );
    }
  } catch (e) {
    logger.debug("syncUserProfileFromDirectory error:", e);
  }
}

export const userSagas = [
  takeEvery(userActions.DELETE_PUSH_ID, deletePushId),
  takeEvery(userActions.STORE_PUSH_ID, storePushId),
  takeEvery(userActions.REFRESH_USER_PROFILE, refreshUserProfile),
  takeEvery(globalActions.APP_FOREGROUND, refreshUserProfile),
  takeEvery(
    directoryActions.FETCH_COMPANY_CONTACTS_SUCCESS,
    syncUserProfileFromDirectory
  )
];
