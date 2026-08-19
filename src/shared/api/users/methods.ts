import { Platform } from "react-native";
import HttpClient from "../client/http-client.ts";
import { getUniqueId } from "react-native-device-info";
import {
  ChatNotifications,
  ForgotPasswordBody,
  ResetResponse,
  SetPushTokenBody,
  SetPushTokenResponse
} from "./types.ts";
import { APIError } from "../client/types/types.ts";
import { Logger } from "shared/utils/Logger.ts";
import { normalizeUserDnd } from "shared/utils/user-dnd.ts";
import { logAndroidVoipPushToken } from "core/notifications/androidVoipPushTokenLog.ts";

const logger = new Logger("User API");

interface Headers {
  Accept: string;
  "Content-Type": string;
  Authorization?: string;
}

const headers: Headers = {
  Accept: "application/json",
  "Content-Type": "application/json"
};

export const requestPasswordReset = async (
  data: ForgotPasswordBody
): Promise<ResetResponse> => {
  const apiClient = new HttpClient();

  try {
    await apiClient.post(`/v2/users/request-password-reset`, data, headers);

    if (apiClient.success) {
      return apiClient.response as unknown as ResetResponse;
    }
  } catch (error) {
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

export const resetPassword = async (
  password: string,
  accessToken: string
): Promise<ResetResponse> => {
  const apiClient = new HttpClient();
  headers.Authorization = `Bearer ${accessToken}`;

  try {
    await apiClient.post(
      `/v2/users/manual-reset-password`,
      { password },
      headers
    );

    if (apiClient.success) {
      return apiClient.response as unknown as ResetResponse;
    }
  } catch (error) {
    logger.error("manualResetPassword() error: ", error);
    throw error;
  }

  throw apiClient.response as unknown as APIError;
};

// ======= Push Token Handlers ======= //

export async function setPushToken({
  tokenType,
  token,
  accessToken
}: SetPushTokenBody) {
  const apiClient = new HttpClient();
  headers.Authorization = `Bearer ${accessToken}`;

  const id = await getUniqueId();
  const body = {
    deviceId: id,
    tokenType: tokenType,
    token
  };
  if (Platform.OS === "android" && tokenType === "android_fcm") {
    logAndroidVoipPushToken("backend_pushtoken_api", token, {
      tokenType,
      deviceId: id,
      api: "POST /v2/push/pushtoken"
    });
  }
  try {
    await apiClient.post("/v2/push/pushtoken", body, headers);

    if (apiClient.success) {
      return apiClient.response as unknown as SetPushTokenResponse;
    }
  } catch (error) {
    logger.error("setPushToken() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
}

export async function deletePushToken(accessToken?: string) {
  const apiClient = new HttpClient();

  if (!accessToken) {
    logger.warn(
      "deletePushToken() called without accessToken - skipping API call"
    );
    return;
  }

  const id = await getUniqueId();
  const requestHeaders = {
    ...headers,
    Authorization: `Bearer ${accessToken}`
  };

  logger.debug("🔍 [deletePushToken] Calling API to delete push token", {
    deviceId: id,
    hasAccessToken: !!accessToken,
    platform: Platform.OS
  });

  try {
    await apiClient.post(
      "/v2/push/remove-pushtoken",
      { deviceId: id },
      requestHeaders
    );

    logger.debug("🔍 [deletePushToken] API call completed", {
      success: apiClient.success,
      code: apiClient.code,
      hasResponse: !!apiClient.response,
      platform: Platform.OS
    });

    if (apiClient.success) {
      logger.debug("✅ [deletePushToken] Push token deleted successfully", {
        response: apiClient.response,
        platform: Platform.OS
      });
      return apiClient.response;
    } else {
      logger.warn("⚠️ [deletePushToken] API call returned success=false", {
        code: apiClient.code,
        response: apiClient.response,
        platform: Platform.OS
      });
    }
  } catch (error: any) {
    logger.error("❌ [deletePushToken] Exception caught:", {
      error: error,
      errorMessage: error?.message,
      errorCode: error?.code,
      platform: Platform.OS
    });
    throw error as unknown as SetPushTokenResponse;
  }

  // If we reach here, success was false but no exception was thrown
  logger.error("❌ [deletePushToken] API call failed - throwing error", {
    code: apiClient.code,
    response: apiClient.response,
    platform: Platform.OS
  });
  throw apiClient.response as unknown as APIError;
}

// ======= Current User (for profile refresh / cross-device sync) ====== //

export type CurrentUserProfile = {
  avatarPath?: string;
  coverPhoto?: string;
  /** Normalized "0" | "1" when the API includes dnd */
  dnd?: "0" | "1";
};

export const getCurrentUserProfile = async (
  accessToken: string
): Promise<CurrentUserProfile | null> => {
  const apiClient = new HttpClient();
  const requestHeaders = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`
  };
  try {
    await apiClient.get("/v2/users/me", requestHeaders);
    if (apiClient.success && apiClient.response) {
      const r = apiClient.response as Record<string, unknown>;
      const out: CurrentUserProfile = {
        avatarPath: typeof r.avatarPath === "string" ? r.avatarPath : undefined,
        coverPhoto: typeof r.coverPhoto === "string" ? r.coverPhoto : undefined
      };
      if ("dnd" in r) {
        out.dnd = normalizeUserDnd(r.dnd);
      }
      return out;
    }
  } catch (e) {
    logger.debug("getCurrentUserProfile() not available or error:", e);
  }
  return null;
};

// ======= User Theme and Settings Patches ====== //

export const patchUserAvatar = async (
  formData: FormData,
  accessToken: string
) => {
  const apiClient = new HttpClient();
  try {
    await apiClient.patch(`/v2/users/user-settings/avatar`, formData, {
      "Content-Type": "multipart/form-data",
      Authorization: `Bearer ${accessToken}`
    });

    if (apiClient.success) {
      return apiClient.response as unknown as { avatarPath: string };
    }
  } catch (error) {
    logger.error("patchUserAvatar() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

export const patchUserBanner = async (
  formData: FormData,
  accessToken: string
) => {
  const apiClient = new HttpClient();
  try {
    await apiClient.patch(`/v2/users/user-settings/banner`, formData, {
      "Content-Type": "multipart/form-data",
      Authorization: `Bearer ${accessToken}`
    });

    if (apiClient.success) {
      return apiClient.response as unknown as { coverPhoto: string };
    }
  } catch (error) {
    logger.error("patchUserBanner() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

export const patchUserTitle = async (title: string) => {
  const apiClient = new HttpClient();
  try {
    await apiClient.patch(
      `/v2/users/user-settings/title`,
      { title: title },
      headers
    );

    if (apiClient.success) {
      return apiClient.response as unknown as { coverPhoto: string };
    }
  } catch (error) {
    logger.error("patchUserTitle() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

export const patchUserTheme = async (darkMode: number) => {
  const apiClient = new HttpClient();
  try {
    await apiClient.patch(
      `/v2/users/user-settings/dark-mode`,
      { darkMode },
      headers
    );

    if (apiClient.success) {
      return apiClient.response as unknown as { darkMode: string };
    }
  } catch (error) {
    logger.error("patchUserTheme() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

export const patchCallNotifications = async (
  enableCallNotifications: number,
  accessToken?: string
) => {
  const apiClient = new HttpClient();
  try {
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    await apiClient.patch(
      `/v2/users/user-settings/call-notifications`,
      {
        enableCallNotifications
      },
      headers
    );

    if (apiClient.success) {
      return apiClient.response as unknown as {
        enableCallNotifications: number;
      };
    }
  } catch (error) {
    logger.error("patchCallNotifications() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

export const patchChatNotifications = async (
  data: ChatNotifications,
  accessToken?: string
) => {
  const apiClient = new HttpClient();
  try {
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    await apiClient.patch(
      `/v2/users/user-settings/mobile/chat-notifications`,
      data,
      headers
    );

    if (apiClient.success) {
      return apiClient.response as unknown as ChatNotifications;
    }
  } catch (error) {
    logger.error("patchChatNotifications() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

export const patchTextNotifications = async (
  enableTextNotifications: number,
  accessToken?: string
) => {
  const apiClient = new HttpClient();
  try {
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    // await apiClient.patch(
    //   `/v2/users/user-settings/text-notifications`,
    //   {
    //     enableTextNotifications
    //   },
    //   headers
    // );

    await apiClient.patch(
      `/v2/users/user-settings/mobile/text-notifications`,
      { enableMobileTextNotifications: enableTextNotifications },
      headers
    );

    if (apiClient.success) {
      return apiClient.response as unknown as {
        enableTextNotifications: number;
      };
    }
  } catch (error) {
    logger.error("patchTextNotifications() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

export const toggleUserDND = async (dnd: boolean, accessToken?: string) => {
  const apiClient = new HttpClient();
  try {
    const requestHeaders = { ...headers };
    if (accessToken) {
      requestHeaders.Authorization = `Bearer ${accessToken}`;
    }

    await apiClient.patch(
      `/v2/users/user-settings/dnd`,
      { dnd },
      requestHeaders
    );

    if (apiClient.success) {
      return apiClient.response as unknown as { dnd: boolean };
    }
  } catch (error) {
    logger.error("patchToggleUserDND() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};
