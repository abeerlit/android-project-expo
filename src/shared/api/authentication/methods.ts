import HttpClient from "../client/http-client.ts";
import { Logger } from "shared/utils/Logger.ts";
import { APIError } from "../client/types/types.ts";
import {
  AuthResponse,
  BasicAuthRequestBody,
  MFAResendOTPBody,
  MFAResendOTPResponse,
  MFASetupBody,
  MFASetupResponse,
  MFAToggleBody,
  MFAToggleResponse,
  MFAValidateBody,
  MFAVerifyBody
} from "./types.ts";

const logger = new Logger("Auth API: ");

const headers = {
  Accept: "application/json",
  "Content-Type": "application/json",
  Authorization: ""
};

// BASIC AUTHENTICATION WITH USERNAME AND PASSWORD
export const authenticate = async (
  data: BasicAuthRequestBody
): Promise<AuthResponse> => {
  logger.debug("authenticate(): ", data);
  const apiClient = new HttpClient();
  try {
    await apiClient.post(`/v2/authentication/mfa`, data, headers);

    if (apiClient.success) {
      return apiClient.response as unknown as AuthResponse;
    }
  } catch (error) {
    logger.error("authenticate() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

// JWT AUTHENTICATION
export const jwtAuthenticate = async (token: string): Promise<AuthResponse> => {
  logger.debug("authenticate(): ", token);
  const apiClient = new HttpClient();

  try {
    await apiClient.post(
      `/v2/authentication/jwt`,
      { accessToken: token },
      headers
    );

    if (apiClient.success) {
      return apiClient.response as unknown as AuthResponse;
    }
  } catch (error) {
    logger.error("jwtAuthenticate() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

export const googleSignIn = async (token: string): Promise<AuthResponse> => {
  logger.debug("googleAuthenticate(): ", token);
  const apiClient = new HttpClient();

  try {
    await apiClient.post(
      `/v2/oauth/app/google/verify`,
      { accessToken: token },
      headers
    );

    if (apiClient.success) {
      return apiClient.response as unknown as AuthResponse;
    }
  } catch (error) {
    logger.error("googleAuthenticate() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

export const azureSignIn = async (token: string): Promise<AuthResponse> => {
  logger.debug("azureSignIn(): ", token);
  const apiClient = new HttpClient();

  try {
    await apiClient.post(
      `/v2/oauth/app/azure/verify`,
      { accessToken: token },
      headers
    );

    if (apiClient.success) {
      return apiClient.response as unknown as AuthResponse;
    }
  } catch (error) {
    logger.error("googleAuthenticate() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

// RESEND OTP REQUEST FROM A USER THAT HAS NO TOKEN
export const resendOTP = async (
  data: MFAResendOTPBody
): Promise<MFAResendOTPResponse> => {
  logger.debug("resendOTP(): ", data);
  const apiClient = new HttpClient();

  try {
    await apiClient.post(`/v2/mfa/resend-otp`, data, headers);

    if (apiClient.success) {
      return apiClient.response as unknown as MFAResendOTPResponse;
    }
  } catch (error) {
    logger.error("resendOTP() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

// SETUP MFA FOR A USER THAT HAS NO TOKEN
export const setupMFA = async (
  data: MFASetupBody
): Promise<MFASetupResponse> => {
  logger.debug("setupMFA(): ", data);
  const apiClient = new HttpClient();

  try {
    await apiClient.post(`/v2/mfa/setup`, data, headers);

    if (apiClient.success) {
      return apiClient.response as unknown as MFASetupResponse;
    }
  } catch (error) {
    logger.error("setupMFA() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

// SETUP MFA FOR A USER THAT HAS TOKEN
export const setupAuthMFA = async (
  data: MFASetupBody,
  accessToken: string
): Promise<MFASetupResponse> => {
  const apiClient = new HttpClient();
  headers.Authorization = `Bearer ${accessToken}`;

  try {
    await apiClient.post(`/v2/mfa/auth/setup`, data, headers);

    if (apiClient.success) {
      return apiClient.response as unknown as MFASetupResponse;
    }
  } catch (error) {
    logger.error("setupAuthMFA() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

// VERIFY MFA FOR A USER
export const verifyAuthMFA = async (
  data: MFASetupBody
): Promise<MFASetupResponse> => {
  const apiClient = new HttpClient();

  try {
    await apiClient.post(`/v2/mfa/auth/verify`, data, headers);

    if (apiClient.success) {
      return apiClient.response as unknown as MFASetupResponse;
    }
  } catch (error) {
    logger.error("verifyAuthMFA() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

// Disable mode
export const disableModeMFA = async (
  data: MFASetupBody
): Promise<MFASetupResponse> => {
  const apiClient = new HttpClient();

  try {
    await apiClient.post(`/v2/mfa/auth/disable-mode`, data, headers);

    if (apiClient.success) {
      return apiClient.response as unknown as any;
    }
  } catch (error) {
    logger.error("disableMode() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

// VALIDATE MFA
export const validateMFA = async (
  data: MFAValidateBody
): Promise<AuthResponse> => {
  const apiClient = new HttpClient();

  try {
    await apiClient.post(`/v2/mfa/validate`, data, headers);

    if (apiClient.success) {
      return apiClient.response as unknown as AuthResponse;
    }
  } catch (error) {
    logger.error("validateMFA() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

// VERIFY MFA FOR A USER THAT HAS NO TOKEN
export const verifyMFA = async (data: MFAVerifyBody): Promise<AuthResponse> => {
  logger.debug("verifyMFA()", data);
  const apiClient = new HttpClient();

  try {
    await apiClient.post(`/v2/mfa/verify`, data, headers);

    if (apiClient.success) {
      return apiClient.response as unknown as AuthResponse;
    }
  } catch (error) {
    logger.error("verifyMFA() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

// ENABLE A MFA METHOD FOR A USER WITH TOKEN (LOGGED IN)
export const enableMFA = async (
  data: MFAToggleBody,
  accessToken: string
): Promise<MFAToggleResponse> => {
  const apiClient = new HttpClient();
  headers.Authorization = `Bearer ${accessToken}`;

  try {
    await apiClient.post(`/v2/mfa/auth/enable`, data, headers);

    if (apiClient.success) {
      return apiClient.response as unknown as MFAToggleResponse;
    }
  } catch (error) {
    logger.error("enableMFA() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

// SETUP MFA FOR A USER WITH TOKEN (LOGGED IN)
export const setupMFAAuth = async (
  data: MFASetupBody
): Promise<MFASetupResponse> => {
  const apiClient = new HttpClient();

  try {
    await apiClient.post(`/v2/mfa/auth/setup`, data, headers);

    if (apiClient.success) {
      return apiClient.response as unknown as MFASetupResponse;
    }
  } catch (error) {
    logger.error("setupMFAA() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

// DISABLE ALL MFA METHODS FOR A USER WITH TOKEN (LOGGED IN)
export const disableMFA = async (
  accessToken: string
): Promise<MFAToggleResponse> => {
  const apiClient = new HttpClient();
  headers.Authorization = "Bearer " + accessToken;

  try {
    await apiClient.post(`/v2/mfa/auth/disable`, {}, headers);

    if (apiClient.success) {
      return apiClient.response as unknown as MFAToggleResponse;
    }
  } catch (error) {
    logger.error("disableMFA() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

// DISABLE AN MFA MODE FOR A USER WITH TOKEN (LOGGED IN)
export const disableMFAMode = async (
  data: MFAToggleBody,
  accessToken: string
): Promise<MFAToggleResponse> => {
  const apiClient = new HttpClient();
  headers.Authorization = `Bearer ${accessToken}`;

  try {
    await apiClient.post(`/v2/mfa/auth/disable-mode`, data, headers);

    if (apiClient.success) {
      return apiClient.response as unknown as MFAToggleResponse;
    }
  } catch (error) {
    logger.error("disableMFA() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

// RESEND OTP FOR A USER WITH TOKEN (LOGGED IN)
export const resendOTPAuth = async (
  data: MFAResendOTPBody,
  accessToken: string
): Promise<MFAResendOTPResponse> => {
  const apiClient = new HttpClient();
  headers.Authorization = `Bearer ${accessToken}`;

  try {
    await apiClient.post(`/v2/mfa/auth/resend-otp`, data, headers);

    if (apiClient.success) {
      return apiClient.response as unknown as MFAResendOTPResponse;
    }
  } catch (error) {
    logger.error("resendOTP() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

// VERIFY MFA FOR A USER WITH TOKEN (LOGGED IN)
export const verifyMFAAuth = async (
  data: MFAVerifyBody,
  accessToken: string
): Promise<MFAToggleResponse> => {
  const apiClient = new HttpClient();
  headers.Authorization = `Bearer ${accessToken}`;

  try {
    await apiClient.post(`/v2/mfa/auth/verify`, data, headers);

    if (apiClient.success) {
      return apiClient.response as unknown as MFAToggleResponse;
    }
  } catch (error) {
    logger.error("verifyMFAA() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};
